import { prisma, BookingStatus, type Booking } from "@serviceflow/database";
import { ForbiddenError, NotFoundError, ValidationError } from "@serviceflow/shared";
import { findMatchingTechnicians } from "../matching/matching.service";
import { resolveCommissionPercent, splitByCommission } from "../commission/commission.service";
import type { BookingActor } from "./booking-state-machine";
import { assertActorCanTransition } from "./booking-state-machine";
import type { CreateBookingRequestInput } from "./bookings.types";

/**
 * Applies ONE booking status transition inside a transaction: re-checks the
 * current status against the DB (not a caller-supplied value, to avoid
 * races), validates the transition + actor, updates the row, and appends an
 * immutable BookingStatusHistory entry. Every other function in this module
 * is built on top of this — nothing else is allowed to touch `status`.
 */
async function transition(
  bookingId: string,
  to: BookingStatus,
  actor: BookingActor,
  changedByUserId: string | null,
  note?: string,
  extraData: Record<string, unknown> = {},
): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!current || current.deletedAt) throw new NotFoundError("Booking", bookingId);

    assertActorCanTransition(current.status, to, actor);

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: to, ...extraData },
    });

    await tx.bookingStatusHistory.create({
      data: {
        bookingId,
        fromStatus: current.status,
        toStatus: to,
        changedById: changedByUserId,
        note,
      },
    });

    return updated;
  });
}

/** Step 1 of the WhatsApp flow's end state: persist the collected request as REQUESTED. */
export async function createBookingRequest(customerProfileId: string, input: CreateBookingRequestInput) {
  if (input.preferredTime === "SCHEDULED" && !input.scheduledAt) {
    throw new ValidationError("scheduledAt is required when preferredTime is SCHEDULED");
  }

  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service || !service.isActive) {
    throw new ValidationError("Selected service is not available");
  }

  const booking = await prisma.booking.create({
    data: {
      customerId: customerProfileId,
      serviceId: input.serviceId,
      problemDescription: input.problemDescription,
      locationLat: input.location.lat,
      locationLng: input.location.lng,
      locationAddress: input.location.address,
      locationNotes: input.location.notes,
      preferredTime: input.preferredTime,
      scheduledAt: input.scheduledAt,
      estimatedPriceMin: service.basePriceMin,
      estimatedPriceMax: service.basePriceMax,
      status: BookingStatus.REQUESTED,
    },
  });

  await prisma.bookingStatusHistory.create({
    data: { bookingId: booking.id, fromStatus: null, toStatus: BookingStatus.REQUESTED },
  });

  return booking;
}

/** Runs the matching engine and moves the booking into MATCHING, excluding technicians who already declined it. */
export async function matchTechniciansForBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.deletedAt) throw new NotFoundError("Booking", bookingId);

  if (booking.status === BookingStatus.REQUESTED) {
    await transition(bookingId, BookingStatus.MATCHING, "SYSTEM", null);
  } else if (booking.status !== BookingStatus.MATCHING) {
    throw new ValidationError(`Cannot run matching for a booking in status ${booking.status}`);
  }

  const declinedTechnicianIds = await getDeclinedTechnicianIds(bookingId);

  const { dayOfWeek, time } = resolveNeededAt(booking.preferredTime, booking.scheduledAt);
  const allCandidates = await findMatchingTechnicians({
    serviceId: booking.serviceId,
    location: { lat: booking.locationLat, lng: booking.locationLng },
    neededAt: { dayOfWeek, time },
    limit: 3 + declinedTechnicianIds.size, // over-fetch so we can drop declines and still return up to 3
  });

  return allCandidates.filter((c) => !declinedTechnicianIds.has(c.technicianProfileId)).slice(0, 3);
}

async function getDeclinedTechnicianIds(bookingId: string): Promise<Set<string>> {
  // A decline shows up as an OFFERED -> MATCHING transition with the offered
  // technician recorded in the history note (see respondToOffer below).
  const declines = await prisma.bookingStatusHistory.findMany({
    where: { bookingId, fromStatus: BookingStatus.OFFERED, toStatus: BookingStatus.MATCHING },
  });
  const ids = new Set<string>();
  for (const d of declines) {
    if (d.note?.startsWith("declined_by:")) {
      ids.add(d.note.slice("declined_by:".length));
    }
  }
  return ids;
}

/** Customer selects a technician from the matched candidates — offers them the job. */
export async function offerBookingToTechnician(bookingId: string, technicianProfileId: string, customerUserId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { customer: true } });
  if (!booking || booking.deletedAt) throw new NotFoundError("Booking", bookingId);
  if (booking.customer.userId !== customerUserId) {
    throw new ForbiddenError("This booking does not belong to you");
  }

  const technician = await prisma.technicianProfile.findUnique({ where: { id: technicianProfileId } });
  if (!technician || technician.verificationStatus !== "VERIFIED") {
    throw new ValidationError("Selected technician is not available");
  }

  const updated = await transition(bookingId, BookingStatus.OFFERED, "CUSTOMER", customerUserId, undefined, {
    technicianId: technicianProfileId,
  });

  await prisma.technicianProfile.update({
    where: { id: technicianProfileId },
    data: { offeredJobs: { increment: 1 } },
  });

  return updated;
}

/** Technician accepts or declines a job they were offered. */
export async function respondToOffer(bookingId: string, technicianUserId: string, accept: boolean) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { technician: { include: { user: true } } },
  });
  if (!booking || booking.deletedAt) throw new NotFoundError("Booking", bookingId);
  if (!booking.technician || booking.technician.user.id !== technicianUserId) {
    throw new ForbiddenError("This job was not offered to you");
  }

  await prisma.technicianProfile.update({
    where: { id: booking.technician.id },
    data: { respondedJobs: { increment: 1 } },
  });

  if (accept) {
    return transition(bookingId, BookingStatus.ACCEPTED, "TECHNICIAN", technicianUserId);
  }

  return transition(
    bookingId,
    BookingStatus.MATCHING,
    "TECHNICIAN",
    technicianUserId,
    `declined_by:${booking.technician.id}`,
    { technicianId: null },
  );
}

const TECHNICIAN_JOB_STEPS = [BookingStatus.EN_ROUTE, BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] as const;

/** Technician advances the job one step (EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED). */
export async function advanceJobStatus(bookingId: string, technicianUserId: string, to: (typeof TECHNICIAN_JOB_STEPS)[number]) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { technician: { include: { user: true } } },
  });
  if (!booking || booking.deletedAt) throw new NotFoundError("Booking", bookingId);
  if (!booking.technician || booking.technician.user.id !== technicianUserId) {
    throw new ForbiddenError("This job does not belong to you");
  }

  return transition(bookingId, to, "TECHNICIAN", technicianUserId);
}

/** Customer confirms the completed job — this locks in the commission split and creates the Payment invoice. */
export async function confirmJobCompletion(bookingId: string, customerUserId: string, finalPrice?: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true },
  });
  if (!booking || booking.deletedAt) throw new NotFoundError("Booking", bookingId);
  if (booking.customer.userId !== customerUserId) {
    throw new ForbiddenError("This booking does not belong to you");
  }
  if (!booking.technicianId) throw new ValidationError("Booking has no assigned technician");

  const commissionPercent = await resolveCommissionPercent({
    serviceId: booking.serviceId,
    technicianProfileId: booking.technicianId,
  });
  const grossAmount = finalPrice ?? Number(booking.estimatedPriceMax ?? booking.estimatedPriceMin ?? 0);
  const split = splitByCommission(grossAmount, commissionPercent);

  return prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!current) throw new NotFoundError("Booking", bookingId);
    assertActorCanTransition(current.status, BookingStatus.CUSTOMER_CONFIRMED, "CUSTOMER");

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CUSTOMER_CONFIRMED,
        finalPrice: split.grossAmount,
        commissionPercentSnapshot: split.commissionPercent,
      },
    });

    await tx.bookingStatusHistory.create({
      data: { bookingId, fromStatus: current.status, toStatus: BookingStatus.CUSTOMER_CONFIRMED, changedById: customerUserId },
    });

    await tx.payment.create({
      data: {
        bookingId,
        amount: split.grossAmount,
        commissionAmount: split.commissionAmount,
        technicianNetAmount: split.technicianNetAmount,
      },
    });

    await tx.technicianProfile.update({
      where: { id: booking.technicianId! },
      data: { completedJobs: { increment: 1 } },
    });

    return updated;
  });
}

export async function cancelBooking(
  bookingId: string,
  actor: Extract<BookingActor, "CUSTOMER" | "TECHNICIAN" | "ADMIN">,
  actorUserId: string,
  reason: string,
) {
  const booking = await transition(bookingId, BookingStatus.CANCELLED, actor, actorUserId, reason, {
    cancelledAt: new Date(),
    cancelledById: actorUserId,
    cancellationReason: reason,
  });

  if (booking.technicianId && actor === "TECHNICIAN") {
    await prisma.technicianProfile.update({
      where: { id: booking.technicianId },
      data: { cancelledJobs: { increment: 1 } },
    });
  }

  return booking;
}

export async function getBookingById(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: true, customer: true, technician: true, statusHistory: { orderBy: { createdAt: "asc" } } },
  });
  if (!booking || booking.deletedAt) throw new NotFoundError("Booking", bookingId);
  return booking;
}

/** Admin pulls a booking back out of a technician's queue and returns it to the matching pool. */
export async function adminReassignBooking(bookingId: string, adminUserId: string, reason?: string) {
  return transition(bookingId, BookingStatus.MATCHING, "ADMIN", adminUserId, reason ?? "Reassigned by admin", {
    technicianId: null,
  });
}

export interface ListBookingsFilter {
  status?: BookingStatus;
}

export async function listBookingsForAdmin(filter: ListBookingsFilter) {
  return prisma.booking.findMany({
    where: { status: filter.status, deletedAt: null },
    include: { service: true, customer: true, technician: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

function resolveNeededAt(preferredTime: string, scheduledAt: Date | null): { dayOfWeek: number; time: string } {
  const reference = preferredTime === "SCHEDULED" && scheduledAt ? scheduledAt : new Date();
  const dayOfWeek = reference.getDay();
  const time = `${String(reference.getHours()).padStart(2, "0")}:${String(reference.getMinutes()).padStart(2, "0")}`;
  return { dayOfWeek, time };
}
