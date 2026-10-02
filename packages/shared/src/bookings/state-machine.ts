import { BookingActor, BookingStatus } from "../enums";
import { ForbiddenError, InvalidStateTransitionError } from "../errors";

/**
 * The single source of truth for the booking lifecycle. Ported verbatim from
 * the legacy `apps/backend/src/modules/bookings/booking-state-machine.ts`.
 *
 * Every status change MUST go through `assertActorCanTransition` inside a
 * trusted Cloud Function transaction — no code is allowed to write a booking's
 * `status` directly. Clients may call `getValidNextStates` / `canActorTransition`
 * only to decide which buttons to show; that is never enforcement.
 */
const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, BookingActor[]>>> = {
  // SYSTEM may cancel a booking nobody could be matched to in time (fixes
  // legacy D-12: bookings stayed in MATCHING forever).
  [BookingStatus.REQUESTED]: {
    [BookingStatus.MATCHING]: [BookingActor.SYSTEM],
    [BookingStatus.CANCELLED]: [BookingActor.CUSTOMER, BookingActor.ADMIN, BookingActor.SYSTEM],
  },
  [BookingStatus.MATCHING]: {
    // Customer selecting a recommended technician offers the job to them.
    [BookingStatus.OFFERED]: [BookingActor.SYSTEM, BookingActor.CUSTOMER],
    [BookingStatus.CANCELLED]: [BookingActor.CUSTOMER, BookingActor.ADMIN, BookingActor.SYSTEM],
  },
  [BookingStatus.OFFERED]: {
    [BookingStatus.ACCEPTED]: [BookingActor.TECHNICIAN],
    // Technician decline, offer expiry (SYSTEM) or admin reassignment all return to the matching pool.
    [BookingStatus.MATCHING]: [BookingActor.TECHNICIAN, BookingActor.SYSTEM, BookingActor.ADMIN],
    [BookingStatus.CANCELLED]: [BookingActor.CUSTOMER, BookingActor.ADMIN],
  },
  [BookingStatus.ACCEPTED]: {
    [BookingStatus.EN_ROUTE]: [BookingActor.TECHNICIAN],
    [BookingStatus.CANCELLED]: [BookingActor.CUSTOMER, BookingActor.TECHNICIAN, BookingActor.ADMIN],
  },
  [BookingStatus.EN_ROUTE]: {
    [BookingStatus.ARRIVED]: [BookingActor.TECHNICIAN],
    [BookingStatus.CANCELLED]: [BookingActor.CUSTOMER, BookingActor.TECHNICIAN, BookingActor.ADMIN],
  },
  [BookingStatus.ARRIVED]: {
    [BookingStatus.IN_PROGRESS]: [BookingActor.TECHNICIAN],
    // Once the technician is on-site, only an admin can void the job.
    [BookingStatus.CANCELLED]: [BookingActor.ADMIN],
  },
  [BookingStatus.IN_PROGRESS]: {
    [BookingStatus.COMPLETED]: [BookingActor.TECHNICIAN],
    [BookingStatus.DISPUTED]: [BookingActor.CUSTOMER, BookingActor.TECHNICIAN, BookingActor.ADMIN],
    [BookingStatus.CANCELLED]: [BookingActor.ADMIN],
  },
  [BookingStatus.COMPLETED]: {
    [BookingStatus.CUSTOMER_CONFIRMED]: [BookingActor.CUSTOMER],
    [BookingStatus.DISPUTED]: [BookingActor.CUSTOMER, BookingActor.TECHNICIAN, BookingActor.ADMIN],
  },
  [BookingStatus.CUSTOMER_CONFIRMED]: {
    [BookingStatus.PAID]: [BookingActor.SYSTEM],
    [BookingStatus.DISPUTED]: [BookingActor.CUSTOMER, BookingActor.TECHNICIAN, BookingActor.ADMIN],
  },
  [BookingStatus.PAID]: {
    [BookingStatus.DISPUTED]: [BookingActor.CUSTOMER, BookingActor.TECHNICIAN, BookingActor.ADMIN],
  },
  [BookingStatus.DISPUTED]: {
    // Admin dispute resolution outcomes only.
    [BookingStatus.CANCELLED]: [BookingActor.ADMIN],
    [BookingStatus.PAID]: [BookingActor.ADMIN],
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

/** Non-throwing variant for UI decisions (which buttons to render). */
export function canActorTransition(from: BookingStatus, to: BookingStatus, actor: BookingActor): boolean {
  return TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export function getValidNextStates(from: BookingStatus): BookingStatus[] {
  return Object.keys(TRANSITIONS[from] ?? {}) as BookingStatus[];
}

/** Next states a given actor may move a booking to — drives the technician's single "next step" button. */
export function getNextStatesForActor(from: BookingStatus, actor: BookingActor): BookingStatus[] {
  return getValidNextStates(from).filter((to) => canActorTransition(from, to, actor));
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return getValidNextStates(status).length === 0;
}
