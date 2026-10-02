import { COLLECTIONS, parseDoc, parseDocs, paths } from "@serviceflow/firebase";
import {
  type AdvanceJobInput,
  type CancelBookingInput,
  type RespondToOfferInput,
  type SubmitQuoteInput,
  bookingContactDoc,
  bookingDoc,
} from "@serviceflow/shared";
import { type DocumentSnapshot, collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import type { Booking, BookingContact } from "../bookings/booking-store";
import { db } from "../firebase/firestore";
import { call } from "../firebase/functions";

/** The technician's jobs on the web: the same reads and callables as the mobile app. */
const estimated = (s: DocumentSnapshot) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

export function watchMyJobs(uid: string, onData: (jobs: Booking[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.bookings), where("participantIds", "array-contains", uid), orderBy("createdAt", "desc"), limit(50)),
    (snap) => onData(parseDocs(bookingDoc, snap.docs.map(estimated)).filter((b) => b.technicianId === uid || b.offeredTechnicianId === uid)),
    onError,
  );
}

export function watchJob(id: string, onData: (job: Booking | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(doc(db(), paths.booking(id)), (s) => onData(s.exists() ? parseDoc(bookingDoc, estimated(s)) : null), onError);
}

/** Readable only once the job is accepted (rules); before that, nothing. */
export function watchJobContact(id: string, onData: (c: BookingContact | null) => void): () => void {
  return onSnapshot(
    doc(db(), paths.bookingContact(id)),
    (s) => onData(s.exists() ? parseDoc(bookingContactDoc, s) : null),
    () => onData(null),
  );
}

export const jobStore = {
  respondToOffer: (input: RespondToOfferInput) => call("respondToOffer", input),
  advance: (input: AdvanceJobInput) => call("advanceJob", input),
  submitQuote: (input: SubmitQuoteInput) => call("submitQuote", input),
  cancel: (input: CancelBookingInput) => call("cancelBooking", input),
};
export type JobStore = typeof jobStore;
