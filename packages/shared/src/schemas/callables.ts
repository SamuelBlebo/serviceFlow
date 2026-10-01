import { z } from "zod";
import { BookingStatus, IdDocumentType, MobileMoneyNetwork, PaymentMethod, PreferredTime } from "../enums";
import { availabilityWindow, serviceAreaCoverage } from "./documents";
import { PROFILE_LIMITS, normalizeGhanaPostGps } from "../profile";
import { docId, ghanaPhone, latLng, minorAmount, personName, requestId } from "./primitives";

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

export const registerTechnicianInput = z.object({
  requestId,
  displayName: z.string().min(2).max(80),
  yearsExperience: z.number().int().min(0).max(60).default(0),
});

export const updateTechnicianServicesInput = z.object({
  requestId,
  serviceIds: z.array(docId).min(1).max(20),
  serviceAreas: z.array(serviceAreaCoverage).min(1).max(10),
  weeklyAvailability: z.array(availabilityWindow).max(14).optional(),
});

export const submitVerificationInput = z.object({
  requestId,
  idType: z.enum(IdDocumentType),
  idNumber: z.string().trim().min(4).max(40),
  idPhotoPath: z.string().min(1),
  selfiePath: z.string().min(1).optional(),
});

// ── Bookings ─────────────────────────────────────────────────────────────

export const createBookingInput = z
  .object({
    requestId,
    serviceId: docId,
    problemDescription: z.string().trim().min(3).max(1000),
    location: latLng.extend({
      address: z.string().max(200).optional(),
      notes: z.string().max(300).optional(),
    }),
    preferredTime: z.enum(PreferredTime),
    /** ISO-8601; required when preferredTime is SCHEDULED (legacy rule). */
    scheduledAt: z.string().datetime().optional(),
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
  reason: z.string().max(300).optional(),
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
  location: latLng.optional(),
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
    msisdn: ghanaPhone.optional(),
    network: z.enum(MobileMoneyNetwork).optional(),
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
  comment: z.string().trim().max(1000).optional(),
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
