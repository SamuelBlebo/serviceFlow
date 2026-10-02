import { collection, doc, limit, onSnapshot, orderBy, query, where } from "@react-native-firebase/firestore";
import { COLLECTIONS, parseDoc, parseDocs, paths, type WithId } from "@serviceflow/firebase";
import {
  type BookingDoc,
  type BookingStatusHistoryDoc,
  type CancelBookingInput,
  type ConfirmCompletionInput,
  type CreateBookingInput,
  type CustomerAddressDoc,
  type RespondToQuoteInput,
  bookingDoc,
  bookingStatusHistoryDoc,
  customerAddressDoc,
} from "@serviceflow/shared";
import { call } from "../lib/call";
import { db } from "../lib/firebase";

/**
 * Customer bookings on mobile: the same reads (rules: participants only)
 * and the same callables as the web app.
 */
export type Booking = WithId<BookingDoc>;
export type HistoryEntry = WithId<BookingStatusHistoryDoc>;
export type Address = WithId<CustomerAddressDoc>;

type Snap = { id: string; data(options?: { serverTimestamps?: "estimate" }): unknown };
const estimated = (s: Snap) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

export function watchMyBookings(uid: string, onData: (b: Booking[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.bookings), where("participantIds", "array-contains", uid), orderBy("createdAt", "desc"), limit(50)),
    (snap) => onData(parseDocs(bookingDoc, snap.docs.map(estimated)).filter((b) => b.customerId === uid)),
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
    (snap) => onData(parseDocs(bookingStatusHistoryDoc, snap.docs.map(estimated))),
    onError,
  );
}

export function watchAddresses(uid: string, onData: (a: Address[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), paths.customerAddresses(uid)), orderBy("createdAt", "asc")),
    (snap) => onData(parseDocs(customerAddressDoc, snap.docs.map(estimated))),
    onError,
  );
}

export const bookingStore = {
  create: (input: CreateBookingInput) => call("createBooking", input),
  cancel: (input: CancelBookingInput) => call("cancelBooking", input),
  respondToQuote: (input: RespondToQuoteInput) => call("respondToQuote", input),
  confirm: (input: ConfirmCompletionInput) => call("confirmCompletion", input),
};
export type BookingStore = typeof bookingStore;

/** The customer's default address id (customers/{uid}), or null before they have a profile. */
export function watchDefaultAddressId(uid: string, onData: (id: string | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.customer(uid)),
    (snap) => onData((snap.data()?.defaultAddressId as string | null | undefined) ?? null),
    onError,
  );
}
