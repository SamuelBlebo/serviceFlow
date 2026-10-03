import { z } from "zod";
import { SETTINGS_LIMITS, isInGhana, isValidCommissionPercent } from "../admin-settings";
import { BookingStatus, CommissionScope, IdDocumentType, MobileMoneyNetwork, PaymentMethod, PreferredTime } from "../enums";
import { availabilityWindow } from "./documents";
import { SERVICE_LIMITS, slugify } from "../catalogue";
import { PROFILE_LIMITS, normalizeGhanaPostGps } from "../profile";
import { ReviewDecision, TECHNICIAN_LIMITS, hasOverlappingWindows, normalizeIdNumber } from "../technician";
import { BOOKING_LIMITS, JOB_LIMITS } from "../bookings/booking";
import { docId, ghanaPhone, latLng, minorAmount, optionalInput, personName, requestId } from "./primitives";

/**
 * Callable request/response schemas. Validated on the server (authoritative)
 * and reused by web/mobile forms so both sides agree on the rules.
 *
 * Stage 2 implements only `health`. The rest are declared now so the
 * contract exists before the domain stages build against it.
 */

export const healthOutput = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});
export type HealthOutput = z.infer<typeof healthOutput>;

// ── Technicians (Stage: onboarding & verification) ──────────────────────

const uniqueIds = (max: number, what: string) =>
  z
    .array(docId)
    .min(1, `Choose at least one ${what}`)
    .max(max, `Choose at most ${max} ${what}s`)
    .refine((ids) => new Set(ids).size === ids.length, { message: `Each ${what} can only be chosen once` });

/** Become a service provider: grants the `tech` capability and creates the profile + wallet. */
export const registerTechnicianInput = z.object({
  requestId,
  displayName: personName,
  yearsExperience: z.number().int().min(0).max(TECHNICIAN_LIMITS.yearsMax),
});
export type RegisterTechnicianInput = z.input<typeof registerTechnicianInput>;

/**
 * What a technician offers and where/when. Areas are catalogue ids: the
 * server copies their coordinates and radius, so clients can't place a
 * technician anywhere they like.
 */
export const updateTechnicianServicesInput = z.object({
  requestId,
  serviceIds: uniqueIds(TECHNICIAN_LIMITS.maxServices, "service"),
  areaIds: uniqueIds(TECHNICIAN_LIMITS.maxAreas, "area"),
  weeklyAvailability: z
    .array(availabilityWindow)
    .min(1, "Add at least one working period")
    .max(TECHNICIAN_LIMITS.maxWindows)
    .refine((w) => !hasOverlappingWindows(w), { message: "Working periods on the same day can't overlap" }),
});
export type UpdateTechnicianServicesInput = z.input<typeof updateTechnicianServicesInput>;

/**
 * Submit identity documents for review. Both images must already be uploaded
 * to the technician's private folder `verifications/{uid}/{submissionId}/`;
 * the server checks they exist, are images and are within the size limit.
 */
export const submitVerificationInput = z
  .object({
    requestId,
    submissionId: docId,
    idType: z.enum(IdDocumentType),
    idNumber: z.string().trim().min(4).max(40),
    idPhotoPath: z.string().min(1),
    selfiePath: z.string().min(1),
  })
  .transform((v, ctx) => {
    const idNumber = normalizeIdNumber(v.idType, v.idNumber);
    if (!idNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["idNumber"],
        message: v.idType === "GHANA_CARD" ? "Enter your Ghana Card number like GHA-123456789-0" : "Check the ID number",
      });
      return z.NEVER;
    }
    return { ...v, idNumber };
  });
export type SubmitVerificationInput = z.input<typeof submitVerificationInput>;

/** Admin decision on a technician. A reason is required for REJECT and SUSPEND. */
export const reviewTechnicianInput = z
  .object({
    requestId,
    technicianId: docId,
    decision: z.enum(ReviewDecision),
    notes: optionalInput(z.string().trim().max(TECHNICIAN_LIMITS.reviewNotesMax)),
  })
  .refine((v) => (v.decision !== "REJECT" && v.decision !== "SUSPEND") || (v.notes?.length ?? 0) >= 5, {
    message: "Explain the reason (the technician will see it)",
    path: ["notes"],
  });
export type ReviewTechnicianInput = z.input<typeof reviewTechnicianInput>;

// ── Bookings ─────────────────────────────────────────────────────────────

const reason = z.string().trim().min(BOOKING_LIMITS.reasonMin, "Give a short reason").max(BOOKING_LIMITS.reasonMax);

/**
 * Request a job. Web and mobile send one of the customer's saved addresses
 * (`addressId`; the server reads it, so directions and area are trusted);
 * WhatsApp sends a shared location pin instead.
 */
export const createBookingInput = z
  .object({
    requestId,
    serviceId: docId,
    problemDescription: z
      .string()
      .trim()
      .min(BOOKING_LIMITS.problemMin, "Describe the problem in a few words (at least 10 characters)")
      .max(BOOKING_LIMITS.problemMax),
    addressId: optionalInput(docId),
    location: optionalInput(
      latLng.extend({
        address: optionalInput(z.string().max(200)),
        notes: optionalInput(z.string().max(300)),
      }),
    ),
    preferredTime: z.enum(PreferredTime),
    /** ISO-8601; required when preferredTime is SCHEDULED (legacy rule). */
    scheduledAt: optionalInput(z.string().datetime({ offset: true })),
    /** Which app sent it (informational only). WhatsApp and admin sources are set by the server. */
    channel: optionalInput(z.enum(["WEB", "MOBILE"])),
  })
  .refine((v) => v.preferredTime !== PreferredTime.SCHEDULED || Boolean(v.scheduledAt), {
    message: "Choose a date and time",
    path: ["scheduledAt"],
  })
  .refine((v) => Boolean(v.addressId) !== Boolean(v.location), {
    message: "Choose where the job is",
    path: ["addressId"],
  });
export type CreateBookingInput = z.input<typeof createBookingInput>;

/** Customer offers the job to one of the booking's recommended technicians. */
export const selectTechnicianInput = z.object({ requestId, bookingId: docId, technicianId: docId });
export type SelectTechnicianInput = z.input<typeof selectTechnicianInput>;

/** Customer asks for a fresh search (e.g. nobody was available, or every candidate declined). */
export const rematchBookingInput = z.object({ requestId, bookingId: docId });
export type RematchBookingInput = z.input<typeof rematchBookingInput>;

export const respondToOfferInput = z.object({
  requestId,
  bookingId: docId,
  accept: z.boolean(),
  reason: optionalInput(z.string().trim().max(BOOKING_LIMITS.reasonMax)),
});
export type RespondToOfferInput = z.input<typeof respondToOfferInput>;

/** The technician's physical job steps — the only statuses they may advance to directly. */
export const TECHNICIAN_JOB_STEPS = [
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
] as const;

export const advanceJobInput = z.object({
  requestId,
  bookingId: docId,
  to: z.enum(TECHNICIAN_JOB_STEPS),
  /** Captured once at EN_ROUTE (optional: the technician may refuse location access). */
  location: optionalInput(latLng),
  /** Notes when finishing (COMPLETED). */
  notes: optionalInput(z.string().trim().max(JOB_LIMITS.notesMax)),
});
export type AdvanceJobInput = z.input<typeof advanceJobInput>;

/** Registers a before/after photo the assigned technician uploaded to `bookings/{id}/{kind}/`. */
export const addJobPhotoInput = z.object({
  requestId,
  bookingId: docId,
  kind: z.enum(["BEFORE", "AFTER"]),
  storagePath: z.string().min(1).max(300),
});
export type AddJobPhotoInput = z.input<typeof addJobPhotoInput>;

/** Technician's price for the job, within the service's range (Decision D4). */
export const submitQuoteInput = z.object({
  requestId,
  bookingId: docId,
  amountMinor: minorAmount.refine((v) => v > 0, { message: "Enter the price" }),
  note: optionalInput(z.string().trim().max(BOOKING_LIMITS.quoteNoteMax)),
});
export type SubmitQuoteInput = z.input<typeof submitQuoteInput>;

/** Customer accepts or declines the quote; declining needs a reason the technician sees. */
export const respondToQuoteInput = z
  .object({
    requestId,
    bookingId: docId,
    accept: z.boolean(),
    reason: optionalInput(z.string().trim().max(BOOKING_LIMITS.reasonMax)),
  })
  .refine((v) => v.accept || (v.reason?.length ?? 0) >= BOOKING_LIMITS.reasonMin, {
    message: "Tell the technician why (for example, too expensive)",
    path: ["reason"],
  });
export type RespondToQuoteInput = z.input<typeof respondToQuoteInput>;

export const confirmCompletionInput = z.object({ requestId, bookingId: docId });
export type ConfirmCompletionInput = z.input<typeof confirmCompletionInput>;

/** Customer, assigned technician or admin; who may cancel depends on the status. */
export const cancelBookingInput = z.object({ requestId, bookingId: docId, reason });
export type CancelBookingInput = z.input<typeof cancelBookingInput>;

/** Admin: take an offered job back from the technician and return it to matching. */
export const reassignBookingInput = z.object({ requestId, bookingId: docId, reason });
export type ReassignBookingInput = z.input<typeof reassignBookingInput>;

/** Admin: set the agreed price (any amount), e.g. when the job is bigger than the range. */
export const setBookingPriceInput = z.object({
  requestId,
  bookingId: docId,
  amountMinor: minorAmount.refine((v) => v > 0, { message: "Enter the price" }),
  reason,
});
export type SetBookingPriceInput = z.input<typeof setBookingPriceInput>;

// ── Payments, wallet, ratings ────────────────────────────────────────────

export const initiatePaymentInput = z
  .object({
    requestId,
    bookingId: docId,
    method: z.enum(PaymentMethod),
    msisdn: optionalInput(ghanaPhone),
    network: optionalInput(z.enum(MobileMoneyNetwork)),
  })
  .refine((v) => v.method !== PaymentMethod.MOBILE_MONEY || (v.msisdn && v.network), {
    message: "Mobile Money payments need a phone number and network",
    path: ["msisdn"],
  });

export type InitiatePaymentInput = z.input<typeof initiatePaymentInput>;

/** The assigned technician confirms they received the customer's cash. */
export const confirmCashPaymentInput = z.object({ requestId, bookingId: docId });
export type ConfirmCashPaymentInput = z.input<typeof confirmCashPaymentInput>;

/** Local emulator only: plays the payer approving or declining the Mobile Money prompt. */
export const devMockPaymentOutcomeInput = z.object({ bookingId: docId, outcome: z.enum(["SUCCEEDED", "FAILED"]) });
export type DevMockPaymentOutcomeInput = z.input<typeof devMockPaymentOutcomeInput>;

export const requestPayoutInput = z.object({
  requestId,
  amountMinor: minorAmount.refine((v) => v > 0, { message: "Amount must be greater than zero" }),
  network: z.enum(MobileMoneyNetwork),
  msisdn: ghanaPhone,
});

export const submitRatingInput = z.object({
  requestId,
  bookingId: docId,
  score: z.number().int().min(1).max(5),
  comment: optionalInput(z.string().trim().max(1000)),
});

// ── Authentication (Stage 3) ─────────────────────────────────────────────

export const requestOtpInput = z.object({ phone: ghanaPhone });
export type RequestOtpInput = z.infer<typeof requestOtpInput>;

export const requestOtpOutput = z.object({
  ok: z.literal(true),
  /** E.164 form of the number the code was sent to. */
  phone: z.string(),
  expiresInSeconds: z.number().int().positive(),
  resendInSeconds: z.number().int().nonnegative(),
  /**
   * LOCAL EMULATOR ONLY: the code itself, so developers can sign in without an
   * SMS provider. The server never sets this outside the Functions emulator.
   */
  devCode: z.string().optional(),
});
export type RequestOtpOutput = z.infer<typeof requestOtpOutput>;

export const verifyOtpInput = z.object({
  phone: ghanaPhone,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpInput>;

export const verifyOtpOutput = z.object({
  /** Firebase custom token — pass to signInWithCustomToken. */
  token: z.string().min(1),
  isNewUser: z.boolean(),
});
export type VerifyOtpOutput = z.infer<typeof verifyOtpOutput>;

/** Admin: suspend or reactivate an account (audited; requires a recent admin sign-in). */
export const setUserStatusInput = z.object({
  requestId,
  uid: docId,
  reason: z.string().trim().min(3).max(500),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusInput>;

// ── Profiles (Stage 4) ───────────────────────────────────────────────────
// Client form inputs. Profiles are written directly by their owner;
// Firestore Security Rules enforce the same limits on the server.

export const customerProfileInput = z.object({ fullName: personName });
export type CustomerProfileInput = z.infer<typeof customerProfileInput>;

const INVALID_GPS = "__invalid__";

export const addressInput = z.object({
  label: z.string().trim().min(1, "Give this address a name, e.g. Home").max(PROFILE_LIMITS.addressLabelMax),
  directions: z
    .string()
    .trim()
    .min(PROFILE_LIMITS.directionsMin, "Describe how to find you, e.g. a nearby landmark")
    .max(PROFILE_LIMITS.directionsMax),
  ghanaPostGps: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? (normalizeGhanaPostGps(v) ?? INVALID_GPS) : null))
    .refine((v) => v !== INVALID_GPS, { message: "Use a GhanaPost GPS address like GA-543-0125" }),
  areaId: docId,
  notes: z
    .string()
    .trim()
    .max(PROFILE_LIMITS.notesMax)
    .optional()
    .transform((v) => v || null),
});
export type AddressInput = z.input<typeof addressInput>;
export type AddressValues = z.output<typeof addressInput>;

// ── Service catalogue (Stage 5) — admin callables ────────────────────────

const priceMinor = minorAmount.refine((v) => v <= SERVICE_LIMITS.maxPriceMinor, { message: "That price is too high" });

/**
 * Create (no serviceId) or update (serviceId = existing slug) a service.
 * Prices are integer pesewas; the admin UI converts from cedis.
 */
export const upsertServiceInput = z
  .object({
    requestId,
    serviceId: optionalInput(docId),
    name: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(SERVICE_LIMITS.nameMin, "Enter a service name").max(SERVICE_LIMITS.nameMax)),
    description: z.string().trim().max(SERVICE_LIMITS.descriptionMax),
    priceRange: z.object({ minMinor: priceMinor, maxMinor: priceMinor }),
    sortOrder: z.number().int().min(0).max(SERVICE_LIMITS.sortOrderMax),
  })
  .refine((v) => v.priceRange.minMinor <= v.priceRange.maxMinor, {
    message: "The lowest price can't be more than the highest price",
    path: ["priceRange"],
  })
  .refine((v) => v.serviceId !== undefined || slugify(v.name).length > 0, {
    message: "Use letters or numbers in the service name",
    path: ["name"],
  });
export type UpsertServiceInput = z.input<typeof upsertServiceInput>;

/** Hide or re-show a service. Services are never deleted (bookings reference them). */
export const setServiceActiveInput = z.object({
  requestId,
  serviceId: docId,
  isActive: z.boolean(),
  reason: optionalInput(z.string().trim().max(300)),
});
export type SetServiceActiveInput = z.input<typeof setServiceActiveInput>;

// ── Admin settings (Stage 10) ────────────────────────────────────────────

const commissionPercent = z.number().refine(isValidCommissionPercent, {
  message: `Use a percentage from 0 to ${SETTINGS_LIMITS.commissionPercentMax} (up to 2 decimals)`,
});
const intBetween = (r: { min: number; max: number }, what: string) =>
  z.number().int().min(r.min, `${what} must be at least ${r.min}`).max(r.max, `${what} must be at most ${r.max}`);

/** Platform settings admins may change (audited; recent sign-in). */
export const updatePlatformSettingsInput = z.object({
  requestId,
  defaultCommissionPercent: commissionPercent,
  offerTimeoutMinutes: intBetween(SETTINGS_LIMITS.offerTimeoutMinutes, "Offer time"),
  matchingExpiryMinutes: intBetween(SETTINGS_LIMITS.matchingExpiryMinutes, "Matching time"),
  matchRadiusKm: z.number().min(SETTINGS_LIMITS.matchRadiusKm.min).max(SETTINGS_LIMITS.matchRadiusKm.max),
  supportPhone: optionalInput(ghanaPhone),
  cashAllowed: z.boolean(),
});
export type UpdatePlatformSettingsInput = z.input<typeof updatePlatformSettingsInput>;

/** A new commission rule. Rules are never edited — deactivate and create a new one (clear audit trail). */
export const createCommissionRuleInput = z
  .object({
    requestId,
    scope: z.enum(CommissionScope),
    serviceId: optionalInput(docId),
    technicianId: optionalInput(docId),
    percent: commissionPercent,
  })
  .refine((v) => v.scope !== "SERVICE" || Boolean(v.serviceId), { message: "Choose the service", path: ["serviceId"] })
  .refine((v) => v.scope !== "TECHNICIAN" || Boolean(v.technicianId), { message: "Choose the technician", path: ["technicianId"] });
export type CreateCommissionRuleInput = z.input<typeof createCommissionRuleInput>;

export const setCommissionRuleActiveInput = z.object({ requestId, ruleId: docId, isActive: z.boolean() });
export type SetCommissionRuleActiveInput = z.input<typeof setCommissionRuleActiveInput>;

/** Create (no areaId) or edit a service area. Areas are hidden, never deleted (addresses reference them). */
export const upsertServiceAreaInput = z
  .object({
    requestId,
    areaId: optionalInput(docId),
    name: z.string().trim().min(2, "Enter the area name").max(SETTINGS_LIMITS.areaNameMax),
    city: z.string().trim().min(2, "Enter the city").max(60),
    region: z.string().trim().min(2, "Enter the region").max(60),
    center: latLng.refine(isInGhana, { message: "The area's centre must be in Ghana" }),
    defaultRadiusKm: z.number().min(SETTINGS_LIMITS.areaRadiusKm.min).max(SETTINGS_LIMITS.areaRadiusKm.max),
  })
  .refine((v) => v.areaId !== undefined || slugify(v.name).length > 0, { message: "Use letters or numbers in the area name", path: ["name"] });
export type UpsertServiceAreaInput = z.input<typeof upsertServiceAreaInput>;

export const setServiceAreaActiveInput = z.object({ requestId, areaId: docId, isActive: z.boolean() });
export type SetServiceAreaActiveInput = z.input<typeof setServiceAreaActiveInput>;
