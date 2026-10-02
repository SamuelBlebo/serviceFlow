import { collection, doc, limit, onSnapshot, orderBy, query, where } from "@react-native-firebase/firestore";
import { getDownloadURL, putFile, ref } from "@react-native-firebase/storage";
import { COLLECTIONS, parseDoc, parseDocs, paths, storagePaths, type WithId } from "@serviceflow/firebase";
import {
  type AdvanceJobInput,
  type BookingContactDoc,
  type BookingDoc,
  type BookingMediaDoc,
  type CancelBookingInput,
  type RespondToOfferInput,
  type SubmitQuoteInput,
  bookingContactDoc,
  bookingDoc,
  bookingMediaDoc,
} from "@serviceflow/shared";
import * as Location from "expo-location";
import { call } from "../lib/call";
import { db, storage } from "../lib/firebase";
import { newRequestId } from "../lib/request-id";
import { compressPhoto } from "../technician/photos";

/**
 * The technician's jobs: offers made to them and jobs assigned to them.
 * Reads go straight to Firestore (rules: participants only; the customer's
 * contact only once accepted); every change is a callable.
 */
export type Job = WithId<BookingDoc>;
export type JobContact = BookingContactDoc;
export type JobPhoto = WithId<BookingMediaDoc>;

type Snap = { id: string; data(options?: { serverTimestamps?: "estimate" }): unknown };
const estimated = (s: Snap) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

export function watchMyJobs(uid: string, onData: (jobs: Job[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.bookings), where("participantIds", "array-contains", uid), orderBy("createdAt", "desc"), limit(50)),
    // participantIds also holds the user's own customer bookings: keep only jobs.
    (snap) => onData(parseDocs(bookingDoc, snap.docs.map(estimated)).filter((b) => b.technicianId === uid || b.offeredTechnicianId === uid)),
    onError,
  );
}

export function watchJob(id: string, onData: (job: Job | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.booking(id)),
    (snap) => onData(snap.exists() ? parseDoc(bookingDoc, estimated(snap)) : null),
    onError,
  );
}

/** Customer phone and directions — readable only once the technician has accepted. */
export function watchContact(id: string, onData: (c: JobContact | null) => void): () => void {
  return onSnapshot(
    doc(db(), paths.bookingContact(id)),
    (snap) => onData(snap.exists() ? parseDoc(bookingContactDoc, snap) : null),
    // Permission denied before acceptance is expected: show nothing.
    () => onData(null),
  );
}

export function watchPhotos(id: string, onData: (p: JobPhoto[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), paths.bookingMedia(id)), orderBy("createdAt", "asc")),
    (snap) => onData(parseDocs(bookingMediaDoc, snap.docs.map(estimated))),
    onError,
  );
}

export const photoUrl = (path: string) => getDownloadURL(ref(storage(), path));

/** Best effort, once, at "on my way": never blocks the step if refused or slow. */
export async function currentLocation(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return undefined;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    return undefined;
  }
}

export const jobStore = {
  respondToOffer: (input: RespondToOfferInput) => call("respondToOffer", input),
  advance: (input: AdvanceJobInput) => call("advanceJob", input),
  submitQuote: (input: SubmitQuoteInput) => call("submitQuote", input),
  cancel: (input: CancelBookingInput) => call("cancelBooking", input),
  /** Compresses, uploads to the job's folder (rules: assigned technician only), then records it. */
  async addPhoto(bookingId: string, kind: "BEFORE" | "AFTER", localUri: string) {
    const path = storagePaths.bookingMedia(bookingId, kind, `${Date.now()}.jpg`);
    await putFile(ref(storage(), path), await compressPhoto(localUri), { contentType: "image/jpeg" });
    return call("addJobPhoto", { requestId: newRequestId(), bookingId, kind, storagePath: path });
  },
};
export type JobStore = typeof jobStore;
