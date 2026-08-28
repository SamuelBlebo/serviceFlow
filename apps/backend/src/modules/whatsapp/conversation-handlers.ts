import { prisma, ConversationState, PreferredTime } from "@home-service/database";
import * as bookingsService from "../bookings/bookings.service";
import type { ConversationContext, ConversationHandler, ConversationHandlerResult, ServiceMenuItem } from "./conversation.types";

const TIME_OPTIONS: Record<string, Exclude<PreferredTime, "SCHEDULED">> = {
  "1": PreferredTime.ASAP,
  "2": PreferredTime.TODAY,
  "3": PreferredTime.TOMORROW,
};

function selection(inbound: { type: string; text?: string; interactiveId?: string }): string | undefined {
  return inbound.interactiveId ?? inbound.text?.trim();
}

async function buildServiceMenu(): Promise<ServiceMenuItem[]> {
  const services: Array<{ id: string; name: string }> = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return services.map((s, i) => ({ index: i + 1, serviceId: s.id, name: s.name }));
}

export function serviceMenuText(menu: ServiceMenuItem[]): string {
  const lines = menu.map((item) => `${item.index}️⃣ ${item.name}`);
  return `👋 Welcome to Home Service.\n\nWhat service do you need?\n\n${lines.join("\n")}`;
}

/** START — greets the customer and shows the current, DB-driven service menu. Also the reset point after a booking completes. */
export const handleStart: ConversationHandler = async ({ whatsapp, phone }) => {
  const menu = await buildServiceMenu();
  await whatsapp.sendMessage(phone, serviceMenuText(menu));
  return { nextState: ConversationState.SELECT_SERVICE, context: { serviceMenu: menu } };
};

export const handleSelectService: ConversationHandler = async ({ whatsapp, phone, context, inbound }) => {
  const menu = context.serviceMenu ?? (await buildServiceMenu());
  const choice = selection(inbound);
  const picked = menu.find((item) => String(item.index) === choice);

  if (!picked) {
    await whatsapp.sendMessage(phone, `Sorry, I didn't get that.\n\n${serviceMenuText(menu)}`);
    return { nextState: ConversationState.SELECT_SERVICE, context: { serviceMenu: menu } };
  }

  await whatsapp.sendMessage(phone, "What problem are you experiencing?");
  return {
    nextState: ConversationState.DESCRIBE_PROBLEM,
    context: { ...context, serviceId: picked.serviceId, serviceName: picked.name },
  };
};

export const handleDescribeProblem: ConversationHandler = async ({ whatsapp, phone, context, inbound }) => {
  if (inbound.type !== "text" || !inbound.text?.trim()) {
    await whatsapp.sendMessage(phone, "Please describe the problem in a short message.");
    return { nextState: ConversationState.DESCRIBE_PROBLEM, context };
  }

  await whatsapp.sendMessage(phone, "📍 Where should the technician come? Please share your location.");
  return {
    nextState: ConversationState.LOCATION,
    context: { ...context, problemDescription: inbound.text.trim() },
  };
};

export function timeMenuText(): string {
  return "When do you need the technician?\n\n1️⃣ ASAP\n2️⃣ Today\n3️⃣ Tomorrow\n4️⃣ Choose a time";
}

export const handleLocation: ConversationHandler = async ({ whatsapp, phone, context, inbound }) => {
  if (inbound.type !== "location" || !inbound.location) {
    await whatsapp.sendMessage(
      phone,
      "Please share your location using WhatsApp's location feature (📎 → Location) so we can find technicians near you.",
    );
    return { nextState: ConversationState.LOCATION, context };
  }

  await whatsapp.sendMessage(phone, timeMenuText());
  return {
    nextState: ConversationState.TIME,
    context: { ...context, location: { lat: inbound.location.lat, lng: inbound.location.lng } },
  };
};

async function runMatchingAndPresentCandidates(
  params: { customerProfileId: string; phone: string; context: ConversationContext },
  handlers: { whatsapp: import("./whatsapp-provider.interface").WhatsAppProvider },
): Promise<ConversationHandlerResult> {
  const { customerProfileId, phone, context } = params;
  const { whatsapp } = handlers;

  if (!context.serviceId || !context.problemDescription || !context.location || !context.preferredTime) {
    // Defensive — should be unreachable given the state machine's own gating.
    await whatsapp.sendMessage(phone, "Something went wrong with your request. Let's start over. Say \"Hi\" to begin.");
    return { nextState: ConversationState.START, context: {} };
  }

  const booking = await bookingsService.createBookingRequest(customerProfileId, {
    serviceId: context.serviceId,
    problemDescription: context.problemDescription,
    location: context.location,
    preferredTime: context.preferredTime,
    scheduledAt: context.scheduledAt ? new Date(context.scheduledAt) : undefined,
  });

  const candidates = await bookingsService.matchTechniciansForBooking(booking.id);

  if (candidates.length === 0) {
    await whatsapp.sendMessage(
      phone,
      "We couldn't find an available verified technician near you right now. Please try again shortly, or say \"Hi\" to start a new request.",
    );
    return { nextState: ConversationState.ENDED, context: { ...context, bookingId: booking.id } };
  }

  const lines = candidates.map(
    (c, i) => `${i + 1}️⃣ ⭐ ${c.averageRating.toFixed(1)} — ${c.completedJobs} jobs (${c.distanceKm}km away)`,
  );
  await whatsapp.sendMessage(
    phone,
    `We found ${candidates.length} verified technician${candidates.length > 1 ? "s" : ""} near you:\n\n${lines.join("\n")}\n\nReply with a number to choose a technician.`,
  );

  return {
    nextState: ConversationState.SELECT_TECHNICIAN,
    context: { ...context, bookingId: booking.id, candidates },
  };
};

export const handleTime: ConversationHandler = async ({ whatsapp, phone, context, inbound, customerProfileId }) => {
  const choice = selection(inbound);

  if (context.awaitingCustomTime) {
    if (inbound.type !== "text" || !inbound.text?.trim()) {
      await whatsapp.sendMessage(phone, "Please reply with a date and time, e.g. \"25/08 14:00\".");
      return { nextState: ConversationState.TIME, context };
    }
    const scheduledAt = parseCustomTime(inbound.text.trim());
    if (!scheduledAt) {
      await whatsapp.sendMessage(phone, "I couldn't read that. Please use the format DD/MM HH:mm, e.g. \"25/08 14:00\".");
      return { nextState: ConversationState.TIME, context };
    }
    const updatedContext: ConversationContext = {
      ...context,
      preferredTime: PreferredTime.SCHEDULED,
      scheduledAt: scheduledAt.toISOString(),
      awaitingCustomTime: false,
    };
    return runMatchingAndPresentCandidates({ customerProfileId, phone, context: updatedContext }, { whatsapp });
  }

  if (choice === "4") {
    await whatsapp.sendMessage(phone, "What date and time works for you? Please reply as DD/MM HH:mm, e.g. \"25/08 14:00\".");
    return { nextState: ConversationState.TIME, context: { ...context, awaitingCustomTime: true } };
  }

  const preferredTime = choice ? TIME_OPTIONS[choice] : undefined;
  if (!preferredTime) {
    await whatsapp.sendMessage(phone, `Sorry, I didn't get that.\n\n${timeMenuText()}`);
    return { nextState: ConversationState.TIME, context };
  }

  const updatedContext: ConversationContext = { ...context, preferredTime };
  return runMatchingAndPresentCandidates({ customerProfileId, phone, context: updatedContext }, { whatsapp });
};

export function parseCustomTime(input: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(input);
  if (!match) return null;
  const [, dd, mm, hh, min] = match;
  const now = new Date();
  const candidate = new Date(now.getFullYear(), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  if (Number.isNaN(candidate.getTime())) return null;
  if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1); // rolled-over date, e.g. Dec -> Jan
  return candidate;
}

/** MATCHING is normally transient (resolved synchronously inside handleTime) — this only guards a stray inbound message arriving mid-match. */
export const handleMatching: ConversationHandler = async ({ whatsapp, phone, context }) => {
  await whatsapp.sendMessage(phone, "Please wait a moment while we find technicians for you...");
  return { nextState: ConversationState.MATCHING, context };
};

export const handleSelectTechnician: ConversationHandler = async ({ whatsapp, phone, context, inbound, customerUserId }) => {
  const choice = selection(inbound);
  const index = choice ? Number(choice) : NaN;
  const candidates = context.candidates ?? [];
  const picked = Number.isInteger(index) ? candidates[index - 1] : undefined;

  if (!picked || !context.bookingId) {
    await whatsapp.sendMessage(phone, "Please reply with the number of the technician you'd like to book.");
    return { nextState: ConversationState.SELECT_TECHNICIAN, context };
  }

  await bookingsService.offerBookingToTechnician(context.bookingId, picked.technicianProfileId, customerUserId);

  await whatsapp.sendMessage(
    phone,
    `✅ Booking confirmed! We've notified ${picked.fullName}. You'll get a message as soon as they accept.`,
  );

  return { nextState: ConversationState.BOOKING_CREATED, context: { ...context } };
};

/** Terminal states — any further message from this customer starts a brand new request. */
export const handleRestart: ConversationHandler = async (params) => handleStart(params);

export const STATE_HANDLERS: Record<ConversationState, ConversationHandler> = {
  [ConversationState.START]: handleStart,
  [ConversationState.SELECT_SERVICE]: handleSelectService,
  [ConversationState.DESCRIBE_PROBLEM]: handleDescribeProblem,
  [ConversationState.LOCATION]: handleLocation,
  [ConversationState.TIME]: handleTime,
  [ConversationState.MATCHING]: handleMatching,
  [ConversationState.SELECT_TECHNICIAN]: handleSelectTechnician,
  [ConversationState.CONFIRM_BOOKING]: handleRestart, // reserved for a future explicit confirm step
  [ConversationState.BOOKING_CREATED]: handleRestart,
  [ConversationState.ENDED]: handleRestart,
};
