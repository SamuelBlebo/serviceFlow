import { z } from "zod";
import {
  BookingMediaKind,
  BookingStatus,
  ChannelSource,
  CommissionScope,
  DisputeRaisedBy,
  DisputeStatus,
  IdDocumentType,
  MobileMoneyNetwork,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  PreferredTime,
  UserStatus,
  VerificationStatus,
  WalletTransactionType,
} from "../enums";
import { WEIGHTS } from "../matching/score";
import { DEFAULT_TIMEZONE } from "../time";
import { clockTime, docId, latLng, minorAmount, percent, timestampLike } from "./primitives";

/**
 * Firestore document shapes (SERVICEFLOW_MIGRATION_PLAN.md §8.2). These are
 * the contract between Cloud Functions (writers) and the web/mobile apps
 * (readers). Money is always integer minor units; times are Timestamps.
 */

// ── Identity ────────────────────────────────────────────────────────────

export const userDoc = z.object({
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  displayName: z.string().max(80),
  status: z.enum(UserStatus),
  /** Display mirror of the custom claims. Rules and Functions trust ONLY the token. */
  capabilities: z.object({ tech: z.boolean(), admin: z.boolean() }),
  createdAt: timestampLike,
  lastLoginAt: timestampLike.optional(),
  suspension: z
    .object({ reason: z.string(), byUid: docId, at: timestampLike })
    .nullable()
    .optional(),
});
export type UserDoc = z.infer<typeof userDoc>;

export const customerDoc = z.object({
  fullName: z.string().min(1).max(80),
  defaultLocation: latLng.extend({ label: z.string().max(120), areaId: docId.optional() }).nullable(),
});
export type CustomerDoc = z.infer<typeof customerDoc>;

export const serviceAreaCoverage = z.object({
  name: z.string().min(1).max(80),
  lat: z.number(),
  lng: z.number(),
  radiusKm: z.number().positive().max(50),
  areaId: docId.optional(),
});

export const availabilityWindow = z
  .object({ day: z.number().int().min(0).max(6), start: clockTime, end: clockTime })
  .refine((w) => w.start < w.end, { message: "Start time must be before end time" });

export const technicianStats = z.object({
  ratingSum: z.number().int().nonnegative(),
  ratingCount: z.number().int().nonnegative(),
  avgRating: z.number().min(0).max(5),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  offered: z.number().int().nonnegative(),
  responded: z.number().int().nonnegative(),
});

export const technicianDoc = z.object({
  displayName: z.string().min(1).max(80),
  photoPath: z.string().nullable(),
  bio: z.string().max(500),
  yearsExperience: z.number().int().min(0).max(60),
  serviceIds: z.array(docId).max(20),
  serviceAreas: z.array(serviceAreaCoverage).max(10),
  weeklyAvailability: z.array(availabilityWindow).max(14),
  isOnline: z.boolean(),
  verificationStatus: z.enum(VerificationStatus),
  stats: technicianStats,
  activeBookingId: docId.nullable(),
  createdAt: timestampLike,
});
export type TechnicianDoc = z.infer<typeof technicianDoc>;

export const technicianVerificationDoc = z.object({
  technicianId: docId,
  idType: z.enum(IdDocumentType),
  idNumber: z.string().min(4).max(40),
  idPhotoPath: z.string(),
  selfiePath: z.string().nullable(),
  status: z.enum(VerificationStatus),
  reviewNotes: z.string().nullable(),
  reviewedBy: docId.nullable(),
  submittedAt: timestampLike,
  reviewedAt: timestampLike.nullable(),
});
export type TechnicianVerificationDoc = z.infer<typeof technicianVerificationDoc>;

// ── Catalogue & settings ─────────────────────────────────────────────────

export const serviceDoc = z
  .object({
    name: z.string().min(2).max(60),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    description: z.string().max(300),
    iconPath: z.string().nullable(),
    priceRange: z.object({ minMinor: minorAmount, maxMinor: minorAmount }),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
  })
  .refine((s) => s.priceRange.minMinor <= s.priceRange.maxMinor, { message: "Minimum price exceeds maximum" });
export type ServiceDoc = z.infer<typeof serviceDoc>;

export const serviceAreaDoc = z.object({
  name: z.string().min(2).max(60),
  city: z.string(),
  region: z.string(),
  country: z.string().length(2),
  center: latLng,
  defaultRadiusKm: z.number().positive().max(50),
  isActive: z.boolean(),
});
export type ServiceAreaDoc = z.infer<typeof serviceAreaDoc>;

export const commissionRuleDoc = z
  .object({
    scope: z.enum(CommissionScope),
    serviceId: docId.nullable(),
    technicianId: docId.nullable(),
    percent,
    isActive: z.boolean(),
    createdAt: timestampLike,
  })
  .refine((r) => r.scope !== CommissionScope.SERVICE || r.serviceId !== null, { message: "SERVICE rule needs serviceId" })
  .refine((r) => r.scope !== CommissionScope.TECHNICIAN || r.technicianId !== null, {
    message: "TECHNICIAN rule needs technicianId",
  });
export type CommissionRuleDoc = z.infer<typeof commissionRuleDoc>;

export const matchWeights = z.object({
  distance: z.number().min(0),
  rating: z.number().min(0),
  completedJobs: z.number().min(0),
  completionRate: z.number().min(0),
  cancellationRate: z.number().min(0),
  responseRate: z.number().min(0),
});

export const platformSettingsDoc = z.object({
  defaultCommissionPercent: percent,
  currency: z.string().length(3),
  country: z.string().length(2),
  timezone: z.string(),
  offerTimeoutMinutes: z.number().int().positive(),
  matchingExpiryMinutes: z.number().int().positive(),
  matchRadiusKm: z.number().positive(),
  matchWeights,
  minPayoutMinor: minorAmount,
  supportPhone: z.string().nullable(),
});
export type PlatformSettingsDoc = z.infer<typeof platformSettingsDoc>;

/** Development/launch defaults — the values the legacy backend hard-coded or read from env. */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsDoc = {
  defaultCommissionPercent: 15,
  currency: "GHS",
  country: "GH",
  timezone: DEFAULT_TIMEZONE,
  offerTimeoutMinutes: 10,
  matchingExpiryMinutes: 60,
  matchRadiusKm: 15,
  matchWeights: WEIGHTS,
  minPayoutMinor: 2000,
  supportPhone: null,
};

// ── Bookings ─────────────────────────────────────────────────────────────

export const bookingCandidate = z.object({
  technicianId: docId,
  displayName: z.string(),
  averageRating: z.number(),
  completedJobs: z.number().int(),
  distanceKm: z.number(),
  score: z.number(),
});

export const bookingDoc = z.object({
  customerId: docId,
  technicianId: docId.nullable(),
  offeredTechnicianId: docId.nullable(),
  participantIds: z.array(docId).max(3),
  serviceId: docId,
  serviceSnapshot: z.object({ name: z.string() }),
  technicianSnapshot: z.object({ displayName: z.string(), photoPath: z.string().nullable() }).nullable(),
  status: z.enum(BookingStatus),
  problemDescription: z.string().min(3).max(1000),
  location: latLng.extend({ address: z.string().nullable(), areaId: docId.nullable() }),
  preferredTime: z.enum(PreferredTime),
  scheduledAt: timestampLike.nullable(),
  pricing: z.object({
    estimateMinMinor: minorAmount,
    estimateMaxMinor: minorAmount,
    quotedMinor: minorAmount.nullable(),
    finalMinor: minorAmount.nullable(),
    commissionPercentSnapshot: percent.nullable(),
    currency: z.string().length(3),
  }),
  candidates: z.array(bookingCandidate).max(10),
  declinedTechnicianIds: z.array(docId),
  offerExpiresAt: timestampLike.nullable(),
  source: z.enum(ChannelSource),
  cancellation: z
    .object({ byUid: docId.nullable(), actor: z.string(), reason: z.string(), at: timestampLike })
    .nullable(),
  createdAt: timestampLike,
  updatedAt: timestampLike,
});
export type BookingDoc = z.infer<typeof bookingDoc>;

export const bookingStatusHistoryDoc = z.object({
  from: z.enum(BookingStatus).nullable(),
  to: z.enum(BookingStatus),
  actor: z.string(),
  byUid: docId.nullable(),
  note: z.string().nullable(),
  createdAt: timestampLike,
});
export type BookingStatusHistoryDoc = z.infer<typeof bookingStatusHistoryDoc>;

export const bookingMediaDoc = z.object({
  kind: z.enum(BookingMediaKind),
  storagePath: z.string(),
  contentType: z.string().regex(/^image\//),
  sizeBytes: z.number().int().positive().max(8 * 1024 * 1024),
  uploadedBy: docId,
  createdAt: timestampLike,
});
export type BookingMediaDoc = z.infer<typeof bookingMediaDoc>;

// ── Money ────────────────────────────────────────────────────────────────

export const paymentDoc = z.object({
  customerId: docId,
  technicianId: docId,
  amountMinor: minorAmount,
  commissionMinor: minorAmount,
  technicianNetMinor: minorAmount,
  refundedMinor: minorAmount,
  currency: z.string().length(3),
  method: z.enum(PaymentMethod).nullable(),
  status: z.enum(PaymentStatus),
  provider: z.string().nullable(),
  providerReference: z.string().nullable(),
  createdAt: timestampLike,
  paidAt: timestampLike.nullable(),
});
export type PaymentDoc = z.infer<typeof paymentDoc>;

export const walletDoc = z.object({
  availableMinor: z.number().int(), // may be negative only for commission owed on cash jobs (D5)
  pendingPayoutMinor: minorAmount,
  lifetimeEarningsMinor: z.number().int(),
  currency: z.string().length(3),
  lastEntryId: z.string().nullable(),
  entryCount: z.number().int().nonnegative(),
  updatedAt: timestampLike,
});
export type WalletDoc = z.infer<typeof walletDoc>;

export const walletTransactionDoc = z.object({
  type: z.enum(WalletTransactionType),
  amountMinor: minorAmount.refine((v) => v > 0, { message: "Ledger amounts are always positive" }),
  balanceAfter: z.object({ availableMinor: z.number().int(), pendingPayoutMinor: minorAmount }),
  bookingId: docId.nullable(),
  payoutId: docId.nullable(),
  description: z.string(),
  createdBy: z.string(),
  createdAt: timestampLike,
});
export type WalletTransactionDoc = z.infer<typeof walletTransactionDoc>;

export const payoutDoc = z.object({
  technicianId: docId,
  amountMinor: minorAmount,
  network: z.enum(MobileMoneyNetwork),
  destination: z.object({ msisdn: z.string(), accountName: z.string() }),
  status: z.enum(PayoutStatus),
  providerReference: z.string().nullable(),
  failureReason: z.string().nullable(),
  requestedAt: timestampLike,
  processedAt: timestampLike.nullable(),
  processedBy: docId.nullable(),
});
export type PayoutDoc = z.infer<typeof payoutDoc>;

// ── Trust ────────────────────────────────────────────────────────────────

export const ratingDoc = z.object({
  customerId: docId,
  technicianId: docId,
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).nullable(),
  customerFirstName: z.string().max(40),
  createdAt: timestampLike,
});
export type RatingDoc = z.infer<typeof ratingDoc>;

export const disputeDoc = z.object({
  bookingId: docId,
  raisedBy: z.enum(DisputeRaisedBy),
  raisedByUid: docId,
  customerId: docId,
  technicianId: docId.nullable(),
  description: z.string().min(10).max(2000),
  technicianResponse: z.string().max(2000).nullable(),
  evidencePaths: z.array(z.string()).max(10),
  status: z.enum(DisputeStatus),
  resolution: z
    .object({ outcome: z.enum(["CANCELLED", "PAID"]), notes: z.string(), refundMinor: minorAmount })
    .nullable(),
  resolvedBy: docId.nullable(),
  createdAt: timestampLike,
  resolvedAt: timestampLike.nullable(),
});
export type DisputeDoc = z.infer<typeof disputeDoc>;
