import { IdDocumentType, VerificationStatus } from "./enums";
import { ForbiddenError, InvalidStateTransitionError } from "./errors";

/**
 * Technician onboarding and verification rules (Stage 6).
 *
 * Verification is an explicit state machine, like bookings. It structurally
 * fixes legacy defect D-9 (a SUSPENDED or VERIFIED technician could resubmit
 * documents and silently reset themselves to PENDING).
 */
export type VerificationActor = "TECHNICIAN" | "ADMIN";

const VERIFICATION_TRANSITIONS: Record<VerificationStatus, Partial<Record<VerificationStatus, VerificationActor>>> = {
  [VerificationStatus.UNSUBMITTED]: { [VerificationStatus.PENDING]: "TECHNICIAN" },
  [VerificationStatus.PENDING]: { [VerificationStatus.VERIFIED]: "ADMIN", [VerificationStatus.REJECTED]: "ADMIN" },
  [VerificationStatus.REJECTED]: { [VerificationStatus.PENDING]: "TECHNICIAN" },
  [VerificationStatus.VERIFIED]: { [VerificationStatus.SUSPENDED]: "ADMIN" },
  [VerificationStatus.SUSPENDED]: { [VerificationStatus.VERIFIED]: "ADMIN" },
};

export function assertVerificationTransition(from: VerificationStatus, to: VerificationStatus, actor: VerificationActor): void {
  const allowed = VERIFICATION_TRANSITIONS[from]?.[to];
  if (!allowed) throw new InvalidStateTransitionError("Verification", from, to);
  if (allowed !== actor) throw new ForbiddenError(`${actor} cannot move verification from ${from} to ${to}`);
}

export function canSubmitVerification(status: VerificationStatus): boolean {
  return VERIFICATION_TRANSITIONS[status]?.[VerificationStatus.PENDING] === "TECHNICIAN";
}

/** Only VERIFIED technicians can go online and receive jobs. */
export function canGoOnline(status: VerificationStatus): boolean {
  return status === VerificationStatus.VERIFIED;
}

/** Admin decisions on a technician. */
export const ReviewDecision = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  SUSPEND: "SUSPEND",
  REINSTATE: "REINSTATE",
} as const;
export type ReviewDecision = (typeof ReviewDecision)[keyof typeof ReviewDecision];

export const DECISION_TARGET: Record<ReviewDecision, VerificationStatus> = {
  APPROVE: VerificationStatus.VERIFIED,
  REJECT: VerificationStatus.REJECTED,
  SUSPEND: VerificationStatus.SUSPENDED,
  REINSTATE: VerificationStatus.VERIFIED,
};

// ── Identity documents ───────────────────────────────────────────────────

/** Ghana Card (NIA) personal ID number: GHA-123456789-0. */
const GHANA_CARD = /^GHA-\d{9}-\d$/;

/** Normalizes common ways people type an ID number; returns null if invalid for the type. */
export function normalizeIdNumber(type: IdDocumentType, input: string): string | null {
  const compact = input.toUpperCase().replace(/\s+/g, "");
  if (type === IdDocumentType.GHANA_CARD) {
    const digits = compact.replace(/^GHA-?/, "").replace(/-/g, "");
    if (!/^\d{10}$/.test(digits)) return null;
    const formatted = `GHA-${digits.slice(0, 9)}-${digits.slice(9)}`;
    return GHANA_CARD.test(formatted) ? formatted : null;
  }
  return /^[A-Z0-9][A-Z0-9-]{3,19}$/.test(compact) ? compact : null;
}

export const ID_DOCUMENT_LABELS: Record<IdDocumentType, string> = {
  GHANA_CARD: "Ghana Card",
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver's licence",
  VOTER_ID: "Voter ID",
};

export const TECHNICIAN_LIMITS = {
  bioMax: 500,
  yearsMax: 60,
  maxServices: 20,
  maxAreas: 10,
  maxWindows: 14,
  /** Uploaded images (ID, selfie, profile photo) — after client-side compression. */
  maxImageBytes: 8 * 1024 * 1024,
  maxProfilePhotoBytes: 5 * 1024 * 1024,
  reviewNotesMax: 500,
} as const;

/** "Mon–Sat 08:00–18:00" style default for new technicians. */
export const DEFAULT_WEEKLY_AVAILABILITY = [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "08:00", end: "18:00" }));

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Windows must not overlap on the same day (overlaps make availability ambiguous). */
export function hasOverlappingWindows(windows: ReadonlyArray<{ day: number; start: string; end: string }>): boolean {
  const byDay = new Map<number, Array<{ start: string; end: string }>>();
  for (const w of windows) byDay.set(w.day, [...(byDay.get(w.day) ?? []), w]);
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.start < sorted[i - 1]!.end) return true;
    }
  }
  return false;
}
