import { z } from "zod";
import { BookingStatus, IdDocumentType, MobileMoneyNetwork, PaymentMethod, PreferredTime } from "../enums";
import { availabilityWindow } from "./documents";
import { SERVICE_LIMITS, slugify } from "../catalogue";
import { PROFILE_LIMITS, normalizeGhanaPostGps } from "../profile";
import { ReviewDecision, TECHNICIAN_LIMITS, hasOverlappingWindows, normalizeIdNumber } from "../technician";
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

export const createBookingInput = z
  .object({
    requestId,
    serviceId: docId,
    problemDescription: z.string().trim().min(3).max(1000),
    location: latLng.extend({
      address: optionalInput(z.string().max(200)),
      notes: optionalInput(z.string().max(300)),
    }),
    preferredTime: z.enum(PreferredTime),
    /** ISO-8601; required when preferredTime is SCHEDULED (legacy rule). */
    scheduledAt: optionalInput(z.string().datetime()),
  })
  .refine((v) => v.preferredTime !== PreferredTime.SCHEDULED || Boolean(v.scheduledAt), {
    message: "scheduledAt is required when preferredTime is SCHEDULED",
    path: ["scheduledAt"],
  });
export type CreateBookingInput = z.infer<typeof createBookingInput>;

export const selectTechnicianInput = z.object({ requestId, bookingId: docId, technicianId: docId });

export const respondToOfferInput = z.object({
  requestId,
  bookingId: docId,
  accept: z.boolean(),
  reason: optionalInput(z.string().max(300)),
});

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
  location: optionalInput(latLng),
});

export const submitQuoteInput = z.object({ requestId, bookingId: docId, amountMinor: minorAmount });

export const confirmCompletionInput = z.object({ requestId, bookingId: docId });

export const cancelBookingInput = z.object({ requestId, bookingId: docId, reason: z.string().trim().min(3).max(300) });

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
