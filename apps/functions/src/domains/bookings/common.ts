import { createHash } from "node:crypto";
import { paths } from "@serviceflow/firebase";
import {
  type BookingActor,
  type BookingDoc,
  type BookingStatus,
  ForbiddenError,
  NotFoundError,
  TIMELINE_FIELD,
  assertActorCanTransition,
  bookingDoc,
} from "@serviceflow/shared";
import { type DocumentReference, FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";

export interface BookingDeps {
  db: Firestore;
  /** Injectable clock for tests. */
  now?: () => number;
}

export type Booking = BookingDoc;

/**
 * Deterministic booking id per (customer, request): a retried create finds
 * the booking it already made. Hashed so ids are short and URL-friendly.
 */
export function bookingIdFor(customerUid: string, requestId: string): string {
  return `bk_${createHash("sha256").update(`${customerUid}:${requestId}`).digest("hex").slice(0, 20)}`;
}

export function receiptRef(db: Firestore, bookingId: string, uid: string, requestId: string): DocumentReference {
  return db.doc(paths.bookingRequest(bookingId, `${uid}_${requestId}`));
}

/**
 * Reads the booking and this request's idempotency receipt inside the
 * transaction. `done` means the same request already succeeded, so the
 * caller returns without changing anything (safe retries).
 */
export async function readBooking(
  tx: Transaction,
  db: Firestore,
  bookingId: string,
  uid: string,
  requestId: string,
): Promise<{ ref: DocumentReference; booking: Booking; receipt: DocumentReference; done: boolean }> {
  const ref = db.doc(paths.booking(bookingId));
  const receipt = receiptRef(db, bookingId, uid, requestId);
  const [snap, receiptSnap] = await Promise.all([tx.get(ref), tx.get(receipt)]);
  if (!snap.exists) throw new NotFoundError("Booking", bookingId);
  return { ref, booking: bookingDoc.parse(snap.data()), receipt, done: receiptSnap.exists };
}

export function writeReceipt(tx: Transaction, receipt: DocumentReference, action: string): void {
  tx.create(receipt, { action, createdAt: FieldValue.serverTimestamp() });
}

/**
 * THE only code that changes `bookings.status` (plan §5.1). Validates the
 * transition and the actor against the shared state machine, stamps the
 * stage timestamp, and appends immutable history — all in the caller's
 * transaction, after its reads.
 */
export function writeTransition(
  tx: Transaction,
  db: Firestore,
  args: {
    ref: DocumentReference;
    booking: Booking;
    to: BookingStatus;
    actor: BookingActor;
    byUid: string | null;
    note?: string | null;
    extra?: Record<string, unknown>;
  },
): void {
  assertActorCanTransition(args.booking.status, args.to, args.actor);
  tx.update(args.ref, {
    status: args.to,
    [`timeline.${TIMELINE_FIELD[args.to]}`]: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...args.extra,
  });
  tx.create(db.collection(paths.bookingStatusHistory(args.ref.id)).doc(), {
    from: args.booking.status,
    to: args.to,
    actor: args.actor,
    byUid: args.byUid,
    note: args.note ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export function assertCustomer(booking: Booking, uid: string): void {
  if (booking.customerId !== uid) throw new ForbiddenError("This isn't your booking.");
}

export function assertAssignedTechnician(booking: Booking, uid: string): void {
  if (booking.technicianId !== uid) throw new ForbiddenError("This job isn't assigned to you.");
}
