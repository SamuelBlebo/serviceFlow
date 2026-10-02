import { BookingStatus, PreferredTime } from "../enums";

/**
 * Booking rules shared by Functions (enforcement) and clients (UI hints).
 * The status lifecycle itself lives in `state-machine.ts`.
 */

export const BOOKING_LIMITS = {
  problemMin: 10,
  problemMax: 1000,
  reasonMin: 3,
  reasonMax: 300,
  quoteNoteMax: 300,
  /** Scheduled jobs: at least this far ahead… */
  scheduleMinLeadMinutes: 60,
  /** …and at most this far ahead. */
  scheduleMaxDaysAhead: 30,
} as const;

/**
 * Price authority (Decision D4): the technician quotes within the service's
 * price range, the customer accepts, and work can't start until they do.
 * An admin can set the price (any amount) with an audited reason.
 */
export const QuoteStatus = {
  NONE: "NONE",
  PROPOSED: "PROPOSED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

/** Who set the agreed price. */
export const PriceSetBy = { TECHNICIAN: "TECHNICIAN", ADMIN: "ADMIN" } as const;
export type PriceSetBy = (typeof PriceSetBy)[keyof typeof PriceSetBy];

/** A technician quotes once assigned and before work starts (usually on site). */
const QUOTABLE: readonly BookingStatus[] = [BookingStatus.ACCEPTED, BookingStatus.EN_ROUTE, BookingStatus.ARRIVED];

export function canSubmitQuote(status: BookingStatus, quoteStatus: QuoteStatus): boolean {
  // Once agreed, the price only changes through an admin.
  return QUOTABLE.includes(status) && quoteStatus !== QuoteStatus.ACCEPTED;
}

export function canRespondToQuote(status: BookingStatus, quoteStatus: QuoteStatus): boolean {
  return QUOTABLE.includes(status) && quoteStatus === QuoteStatus.PROPOSED;
}

/** Admins may set the price any time before the customer confirms completion. */
const PRICEABLE: readonly BookingStatus[] = [...QUOTABLE, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED];
export function canAdminSetPrice(status: BookingStatus): boolean {
  return PRICEABLE.includes(status);
}

export function isQuoteWithinRange(amountMinor: number, range: { estimateMinMinor: number; estimateMaxMinor: number }): boolean {
  return amountMinor >= range.estimateMinMinor && amountMinor <= range.estimateMaxMinor;
}

/** Statuses in which a technician is busy with this job (one at a time). */
export const ACTIVE_JOB_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.IN_PROGRESS,
];

/** The assigned technician sees the customer's phone and directions only in these. */
export const CONTACT_VISIBLE_STATUSES: readonly BookingStatus[] = [...ACTIVE_JOB_STATUSES, BookingStatus.COMPLETED];

/** A booking the customer still has "open" (not finished or cancelled). */
export function isOpenBooking(status: BookingStatus): boolean {
  return status !== BookingStatus.CANCELLED && status !== BookingStatus.PAID && status !== BookingStatus.CUSTOMER_CONFIRMED;
}

export type BookingTimelineField =
  | "requestedAt"
  | "matchingAt"
  | "offeredAt"
  | "acceptedAt"
  | "enRouteAt"
  | "arrivedAt"
  | "startedAt"
  | "completedAt"
  | "confirmedAt"
  | "paidAt"
  | "disputedAt"
  | "cancelledAt";

/** Which stage timestamp a transition into each status sets. */
export const TIMELINE_FIELD: Record<BookingStatus, BookingTimelineField> = {
  [BookingStatus.REQUESTED]: "requestedAt",
  [BookingStatus.MATCHING]: "matchingAt",
  [BookingStatus.OFFERED]: "offeredAt",
  [BookingStatus.ACCEPTED]: "acceptedAt",
  [BookingStatus.EN_ROUTE]: "enRouteAt",
  [BookingStatus.ARRIVED]: "arrivedAt",
  [BookingStatus.IN_PROGRESS]: "startedAt",
  [BookingStatus.COMPLETED]: "completedAt",
  [BookingStatus.CUSTOMER_CONFIRMED]: "confirmedAt",
  [BookingStatus.PAID]: "paidAt",
  [BookingStatus.DISPUTED]: "disputedAt",
  [BookingStatus.CANCELLED]: "cancelledAt",
};

/**
 * Checks the requested time. Returns a person-readable problem, or null.
 * `SCHEDULED` needs a time between the minimum lead time and the maximum
 * days ahead; the other options must not carry one.
 */
export function scheduleProblem(preferredTime: PreferredTime, scheduledAtMs: number | null, nowMs: number): string | null {
  if (preferredTime !== PreferredTime.SCHEDULED) {
    return scheduledAtMs === null ? null : "Only scheduled bookings have a date and time";
  }
  if (scheduledAtMs === null || Number.isNaN(scheduledAtMs)) return "Choose a date and time";
  if (scheduledAtMs < nowMs + BOOKING_LIMITS.scheduleMinLeadMinutes * 60_000) {
    return `Choose a time at least ${BOOKING_LIMITS.scheduleMinLeadMinutes} minutes from now`;
  }
  if (scheduledAtMs > nowMs + BOOKING_LIMITS.scheduleMaxDaysAhead * 86_400_000) {
    return `Choose a date within the next ${BOOKING_LIMITS.scheduleMaxDaysAhead} days`;
  }
  return null;
}

/** Customer-facing wording for each status. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  [BookingStatus.REQUESTED]: "Finding a technician",
  [BookingStatus.MATCHING]: "Finding a technician",
  [BookingStatus.OFFERED]: "Waiting for the technician to accept",
  [BookingStatus.ACCEPTED]: "Technician assigned",
  [BookingStatus.EN_ROUTE]: "Technician on the way",
  [BookingStatus.ARRIVED]: "Technician has arrived",
  [BookingStatus.IN_PROGRESS]: "Work in progress",
  [BookingStatus.COMPLETED]: "Work completed — please confirm",
  [BookingStatus.CUSTOMER_CONFIRMED]: "Completed",
  [BookingStatus.PAID]: "Paid",
  [BookingStatus.DISPUTED]: "Under review",
  [BookingStatus.CANCELLED]: "Cancelled",
};

/**
 * When an unmatched booking is cancelled by the system (fixes D-12): a
 * scheduled job gets until its scheduled time; anything else gets the
 * platform's matching window from now. Returning to matching after a
 * decline or an expired offer never shortens an existing deadline.
 */
export function matchingDeadlineMs(
  booking: { preferredTime: PreferredTime; scheduledAtMs: number | null; currentDeadlineMs: number | null },
  nowMs: number,
  matchingExpiryMinutes: number,
): number {
  const fresh =
    booking.preferredTime === PreferredTime.SCHEDULED && booking.scheduledAtMs !== null
      ? booking.scheduledAtMs
      : nowMs + matchingExpiryMinutes * 60_000;
  return Math.max(fresh, booking.currentDeadlineMs ?? 0);
}

/** Candidates the customer can still choose (not declined, not the one currently offered). */
export function selectableCandidates<C extends { technicianId: string }>(
  booking: { candidates: readonly C[]; declinedTechnicianIds: readonly string[]; offeredTechnicianId: string | null },
): C[] {
  return booking.candidates.filter(
    (c) => !booking.declinedTechnicianIds.includes(c.technicianId) && c.technicianId !== booking.offeredTechnicianId,
  );
}

/** "under 1 km away" / "2.4 km away" — candidate distances are rounded to 0.1 km. */
export function formatDistance(km: number): string {
  return km < 1 ? "under 1 km away" : `${km} km away`;
}
