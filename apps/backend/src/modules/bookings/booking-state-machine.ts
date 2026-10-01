import { BookingStatus } from "@serviceflow/database";
import { ForbiddenError, InvalidStateTransitionError } from "@serviceflow/shared";

/**
 * Who is allowed to *trigger* a transition. "SYSTEM" means the transition
 * only ever happens as a side effect of a service call (matching engine,
 * payment webhook) — never directly from a client request.
 */
export type BookingActor = "SYSTEM" | "CUSTOMER" | "TECHNICIAN" | "ADMIN";

/**
 * The single source of truth for the booking lifecycle (spec §9). Every
 * status change in the app MUST go through `assertValidBookingTransition` /
 * `assertActorCanTransition` — no service is allowed to `prisma.booking.update`
 * a `status` field directly. This is what makes `REQUESTED -> PAID` and
 * similar arbitrary jumps structurally impossible, not just discouraged.
 */
const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, BookingActor[]>>> = {
  [BookingStatus.REQUESTED]: {
    [BookingStatus.MATCHING]: ["SYSTEM"],
    [BookingStatus.CANCELLED]: ["CUSTOMER", "ADMIN"],
  },
  [BookingStatus.MATCHING]: {
    [BookingStatus.OFFERED]: ["SYSTEM", "CUSTOMER"], // customer selecting a recommended technician offers the job to them
    [BookingStatus.CANCELLED]: ["CUSTOMER", "ADMIN"],
  },
  [BookingStatus.OFFERED]: {
    [BookingStatus.ACCEPTED]: ["TECHNICIAN"],
    // Technician decline OR an admin-initiated reassignment both go back into the matching pool.
    [BookingStatus.MATCHING]: ["TECHNICIAN", "SYSTEM", "ADMIN"],
    [BookingStatus.CANCELLED]: ["CUSTOMER", "ADMIN"],
  },
  [BookingStatus.ACCEPTED]: {
    [BookingStatus.EN_ROUTE]: ["TECHNICIAN"],
    [BookingStatus.CANCELLED]: ["CUSTOMER", "TECHNICIAN", "ADMIN"],
  },
  [BookingStatus.EN_ROUTE]: {
    [BookingStatus.ARRIVED]: ["TECHNICIAN"],
    [BookingStatus.CANCELLED]: ["CUSTOMER", "TECHNICIAN", "ADMIN"],
  },
  [BookingStatus.ARRIVED]: {
    [BookingStatus.IN_PROGRESS]: ["TECHNICIAN"],
    [BookingStatus.CANCELLED]: ["ADMIN"], // once the technician is on-site, only an admin can void the job
  },
  [BookingStatus.IN_PROGRESS]: {
    [BookingStatus.COMPLETED]: ["TECHNICIAN"],
    [BookingStatus.DISPUTED]: ["CUSTOMER", "TECHNICIAN", "ADMIN"],
    [BookingStatus.CANCELLED]: ["ADMIN"],
  },
  [BookingStatus.COMPLETED]: {
    [BookingStatus.CUSTOMER_CONFIRMED]: ["CUSTOMER"],
    [BookingStatus.DISPUTED]: ["CUSTOMER", "TECHNICIAN", "ADMIN"],
  },
  [BookingStatus.CUSTOMER_CONFIRMED]: {
    [BookingStatus.PAID]: ["SYSTEM"],
    [BookingStatus.DISPUTED]: ["CUSTOMER", "TECHNICIAN", "ADMIN"],
  },
  [BookingStatus.PAID]: {
    [BookingStatus.DISPUTED]: ["CUSTOMER", "TECHNICIAN", "ADMIN"],
  },
  [BookingStatus.DISPUTED]: {
    // Admin dispute resolution outcomes only (see disputes.service).
    [BookingStatus.CANCELLED]: ["ADMIN"],
    [BookingStatus.PAID]: ["ADMIN"],
  },
  [BookingStatus.CANCELLED]: {},
};

export function assertValidBookingTransition(from: BookingStatus, to: BookingStatus): void {
  const allowedActors = TRANSITIONS[from]?.[to];
  if (!allowedActors) {
    throw new InvalidStateTransitionError("Booking", from, to);
  }
}

export function assertActorCanTransition(from: BookingStatus, to: BookingStatus, actor: BookingActor): void {
  const allowedActors = TRANSITIONS[from]?.[to];
  if (!allowedActors) {
    throw new InvalidStateTransitionError("Booking", from, to);
  }
  if (!allowedActors.includes(actor)) {
    throw new ForbiddenError(`${actor} cannot move a booking from ${from} to ${to}`);
  }
}

export function getValidNextStates(from: BookingStatus): BookingStatus[] {
  return Object.keys(TRANSITIONS[from] ?? {}) as BookingStatus[];
}
