import { z } from "zod";
import { BookingStatus, IdDocumentType, MobileMoneyNetwork, PaymentMethod, PreferredTime } from "../enums";
import { availabilityWindow, serviceAreaCoverage } from "./documents";
import { docId, ghanaPhone, latLng, minorAmount, requestId } from "./primitives";

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
