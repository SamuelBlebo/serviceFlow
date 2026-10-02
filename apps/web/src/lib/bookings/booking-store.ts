import { COLLECTIONS, parseDoc, parseDocs, paths, type WithId } from "@serviceflow/firebase";
import {
  type BookingContactDoc,
  type BookingDoc,
  type BookingStatus,
  type BookingStatusHistoryDoc,
  type CancelBookingInput,
  type ConfirmCompletionInput,
  type CreateBookingInput,
  type ReassignBookingInput,
  type RematchBookingInput,
  type SelectTechnicianInput,
  type RespondToQuoteInput,
  type SetBookingPriceInput,
  bookingContactDoc,
  bookingDoc,
  bookingStatusHistoryDoc,
} from "@serviceflow/shared";
import { type DocumentSnapshot, collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { call } from "../firebase/functions";

/**
 * Booking data access. Clients only read bookings (rules allow the
 * customer, the offered/assigned technician and admins); every change goes
 * through a callable, where the state machine and ownership are enforced.
 */

export type Booking = WithId<BookingDoc>;
export type HistoryEntry = WithId<BookingStatusHistoryDoc>;
export type BookingContact = BookingContactDoc;

const estimated = (s: DocumentSnapshot) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });
const warn = (what: string) => (id: string, e: unknown) => console.warn(`Skipping invalid ${what} ${id}`, e);

/** Bookings the user takes part in, newest first (the query the rules require). */
export function watchMyBookings(uid: string, onData: (b: Booking[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.bookings), where("participantIds", "array-contains", uid), orderBy("createdAt", "desc"), limit(50)),
    (snap) => onData(parseDocs(bookingDoc, snap.docs.map(estimated), warn("booking"))),
    onError,
  );
}

export function watchBooking(id: string, onData: (b: Booking | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.booking(id)),
    (snap) => onData(snap.exists() ? parseDoc(bookingDoc, estimated(snap)) : null),
    onError,
  );
}

export function watchHistory(id: string, onData: (h: HistoryEntry[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), paths.bookingStatusHistory(id)), orderBy("createdAt", "asc")),
    (snap) => onData(parseDocs(bookingStatusHistoryDoc, snap.docs.map(estimated), warn("history entry"))),
    onError,
  );
}

export function watchContact(id: string, onData: (c: BookingContact | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.bookingContact(id)),
    (snap) => onData(snap.exists() ? parseDoc(bookingContactDoc, snap) : null),
    onError,
  );
}

/** Admin: recent bookings, optionally in one status. */
export function watchAdminBookings(status: BookingStatus | "ALL", onData: (b: Booking[]) => void, onError: (e: Error) => void): () => void {
  const base = collection(db(), COLLECTIONS.bookings);
  const q =
    status === "ALL"
      ? query(base, orderBy("createdAt", "desc"), limit(100))
      : query(base, where("status", "==", status), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => onData(parseDocs(bookingDoc, snap.docs.map(estimated), warn("booking"))), onError);
}

export const bookingStore = {
  create: (input: CreateBookingInput) => call("createBooking", input),
  selectTechnician: (input: SelectTechnicianInput) => call("selectTechnician", input),
  rematch: (input: RematchBookingInput) => call("rematchBooking", input),
  cancel: (input: CancelBookingInput) => call("cancelBooking", input),
  respondToQuote: (input: RespondToQuoteInput) => call("respondToQuote", input),
  confirm: (input: ConfirmCompletionInput) => call("confirmCompletion", input),
  reassign: (input: ReassignBookingInput) => call("reassignBooking", input),
  setPrice: (input: SetBookingPriceInput) => call("setBookingPrice", input),
};
export type BookingStore = typeof bookingStore;
