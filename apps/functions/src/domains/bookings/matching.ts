import { COLLECTIONS, paths } from "@serviceflow/firebase";
import {
  BookingActor,
  BookingStatus,
  ConflictError,
  DEFAULT_PLATFORM_SETTINGS,
  ForbiddenError,
  JOBS_SATURATION,
  type MatchableTechnician,
  type PlatformSettingsDoc,
  VerificationStatus,
  matchingDeadlineMs,
  platformSettingsDoc,
  rankTechnicians,
  resolveNeededAt,
  selectableCandidates,
} from "@serviceflow/shared";
import { FieldValue, type Firestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { type Booking, type BookingDeps, assertCustomer, readBooking, readBookingSnapshot, writeReceipt, writeTransition } from "./common";

/*
 * Matching (plan §5.3, §8.3): query VERIFIED + online technicians who offer
 * the service, then the pure shared filters (area radius, availability in the
 * platform time zone, not declined) and the deterministic score. The top 3
 * are stored on the booking; the customer chooses one, which offers them the
 * job (only stored candidates can be offered — fixes D-6). Offers and
 * unmatched bookings expire on a schedule (fixes D-12).
 */

type Done = Promise<{ ok: true; id: string }>;
const SEARCHABLE: readonly BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.MATCHING];

export async function loadSettings(db: Firestore): Promise<PlatformSettingsDoc> {
  const snap = await db.doc(paths.platformSettings()).get();
  return snap.exists ? platformSettingsDoc.parse(snap.data()) : DEFAULT_PLATFORM_SETTINGS;
}

async function readSettingsInTx(tx: Transaction, db: Firestore): Promise<PlatformSettingsDoc> {
  const snap = await tx.get(db.doc(paths.platformSettings()));
  return snap.exists ? platformSettingsDoc.parse(snap.data()) : DEFAULT_PLATFORM_SETTINGS;
}

type TechnicianRow = MatchableTechnician & { activeBookingId: string | null; photoPath: string | null };

function toMatchable(id: string, d: FirebaseFirestore.DocumentData): TechnicianRow {
  const stats = d.stats ?? {};
  return {
    id,
    fullName: d.displayName ?? "",
    photoPath: d.photoPath ?? null,
    averageRating: stats.avgRating ?? 0,
    completedJobs: stats.completed ?? 0,
    cancelledJobs: stats.cancelled ?? 0,
    offeredJobs: stats.offered ?? 0,
    respondedJobs: stats.responded ?? 0,
    verificationStatus: d.verificationStatus,
    isOnline: d.isOnline === true,
    serviceIds: d.serviceIds ?? [],
    serviceAreas: d.serviceAreas ?? [],
    weeklyAvailability: d.weeklyAvailability ?? [],
    activeBookingId: d.activeBookingId ?? null,
  };
}

/** Ranked candidates for a booking, from current technician data. */
async function findCandidates(db: Firestore, booking: Booking, settings: PlatformSettingsDoc, nowMs: number) {
  const snap = await db
    .collection(COLLECTIONS.technicians)
    .where("verificationStatus", "==", VerificationStatus.VERIFIED)
    .where("isOnline", "==", true)
    .where("serviceIds", "array-contains", booking.serviceId)
    .get();
  // Busy technicians (one job at a time) and the customer themself are out.
  const pool = snap.docs.map((d) => toMatchable(d.id, d.data())).filter((t) => !t.activeBookingId && t.id !== booking.customerId);
  const neededAt = resolveNeededAt(booking.preferredTime, booking.scheduledAt ? new Date(booking.scheduledAt.toMillis()) : null, new Date(nowMs), settings.timezone);
  const ranked = rankTechnicians(
    pool,
    { serviceId: booking.serviceId, location: booking.location, neededAt, excludeTechnicianIds: booking.declinedTechnicianIds, limit: 3 },
    { weights: settings.matchWeights, maxSearchRadiusKm: settings.matchRadiusKm, jobsSaturation: JOBS_SATURATION },
  );
  return ranked.map((c) => ({
    technicianId: c.technicianId,
    displayName: c.fullName,
    averageRating: c.averageRating,
    completedJobs: c.completedJobs,
    distanceKm: c.distanceKm,
    score: c.score,
  }));
}

/**
 * Runs (or re-runs) matching for a booking that has no technician yet:
 * REQUESTED → MATCHING (SYSTEM) on the first run, fresh candidates after.
 * A no-op for bookings that have moved on.
 */
export async function matchBooking(deps: BookingDeps, bookingId: string): Promise<{ candidates: number }> {
  const { db } = deps;
  const nowMs = deps.now?.() ?? Date.now();
  const ref = db.doc(paths.booking(bookingId));
  const pre = await ref.get();
  if (!pre.exists) return { candidates: 0 };
  const booking = readBookingSnapshot(pre);
  if (!SEARCHABLE.includes(booking.status)) return { candidates: 0 };

  const settings = await loadSettings(db);
  const candidates = await findCandidates(db, booking, settings, nowMs);

  await db.runTransaction(async (tx) => {
    const current = readBookingSnapshot(await tx.get(ref));
    if (!SEARCHABLE.includes(current.status)) return;
    const extra = { candidates, lastMatchedAt: FieldValue.serverTimestamp() };
    if (current.status === BookingStatus.REQUESTED) {
      writeTransition(tx, db, { ref, booking: current, to: BookingStatus.MATCHING, actor: BookingActor.SYSTEM, byUid: null, extra });
    } else {
      tx.update(ref, { ...extra, updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return { candidates: candidates.length };
}

/** After a decline, expiry or reassignment: search again if nobody is left to choose. */
export async function rematchIfExhausted(deps: BookingDeps, bookingId: string): Promise<void> {
  try {
    const snap = await deps.db.doc(paths.booking(bookingId)).get();
    if (!snap.exists) return;
      const booking = readBookingSnapshot(snap);
    if (booking.status === BookingStatus.MATCHING && selectableCandidates(booking).length === 0) await matchBooking(deps, bookingId);
  } catch (err) {
    // Best effort: the scheduled job retries bookings left without candidates.
    logger.warn("Re-matching failed", { bookingId, err });
  }
}

/**
 * `bookings-selectTechnician`: the customer offers the job to one of the
 * booking's stored candidates (never an arbitrary technician — D-6). The
 * technician is re-checked (still verified, online, free, offering the
 * service), the offer gets a deadline, and their offer count goes up in
 * the same transaction.
 */
export async function selectTechnician(
  deps: BookingDeps,
  uid: string,
  input: { requestId: string; bookingId: string; technicianId: string },
): Done {
  const { db } = deps;
  const nowMs = deps.now?.() ?? Date.now();
  const technicianRef = db.doc(paths.technician(input.technicianId));

  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, uid, input.requestId);
    const [technician, settings] = await Promise.all([tx.get(technicianRef), readSettingsInTx(tx, db)]);
    if (done) return;
    assertCustomer(booking, uid);
    if (booking.status !== BookingStatus.MATCHING) throw new ConflictError("This booking isn't waiting for a technician choice.");
    if (!selectableCandidates(booking).some((c) => c.technicianId === input.technicianId)) {
      throw new ForbiddenError("Choose one of the technicians recommended for this booking.");
    }
    const t = technician.exists ? toMatchable(technician.id, technician.data()!) : null;
    if (!t || t.verificationStatus !== VerificationStatus.VERIFIED || !t.isOnline || t.activeBookingId || !t.serviceIds.includes(booking.serviceId)) {
      throw new ConflictError("That technician is no longer available. Choose another or search again.");
    }
    writeTransition(tx, db, {
      ref,
      booking,
      to: BookingStatus.OFFERED,
      actor: BookingActor.CUSTOMER,
      byUid: uid,
      extra: {
        offeredTechnicianId: input.technicianId,
        participantIds: FieldValue.arrayUnion(input.technicianId),
        offerExpiresAt: Timestamp.fromMillis(nowMs + settings.offerTimeoutMinutes * 60_000),
      },
    });
    tx.update(technicianRef, { "stats.offered": FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    writeReceipt(tx, receipt, "selectTechnician");
  });
  return { ok: true, id: input.bookingId };
}

/** `bookings-rematch`: the customer asks for a fresh search while waiting for a technician. */
export async function rematchBooking(deps: BookingDeps, uid: string, input: { requestId: string; bookingId: string }) {
  const snap = await deps.db.doc(paths.booking(input.bookingId)).get();
  if (!snap.exists) throw new ForbiddenError("This isn't your booking.");
  const booking = readBookingSnapshot(snap);
  assertCustomer(booking, uid);
  if (!SEARCHABLE.includes(booking.status)) throw new ConflictError("This booking already has a technician or has ended.");
  const { candidates } = await matchBooking(deps, input.bookingId);
  return { ok: true as const, id: input.bookingId, candidates };
}

/** Fields that return a booking to matching, extending (never shortening) its deadline. */
export function backToMatching(booking: Booking, settings: PlatformSettingsDoc, nowMs: number) {
  return {
    offeredTechnicianId: null,
    offerExpiresAt: null,
    matchingExpiresAt: Timestamp.fromMillis(
      matchingDeadlineMs(
        {
          preferredTime: booking.preferredTime,
          scheduledAtMs: booking.scheduledAt?.toMillis() ?? null,
          currentDeadlineMs: booking.matchingExpiresAt?.toMillis() ?? null,
        },
        nowMs,
        settings.matchingExpiryMinutes,
      ),
    ),
  };
}

export { readSettingsInTx };

/**
 * The scheduled sweep (every minute):
 *  1. offers past `offerExpiresAt` go back to matching (SYSTEM); the
 *     technician is excluded from this booking and the customer chooses again;
 *  2. bookings still without a technician past `matchingExpiresAt` are
 *     cancelled (SYSTEM) with a clear reason;
 *  3. bookings in matching with nobody left to choose are searched again.
 */
export async function sweepBookings(deps: BookingDeps): Promise<{ offersExpired: number; cancelled: number; rematched: number }> {
  const { db } = deps;
  const nowMs = deps.now?.() ?? Date.now();
  const now = Timestamp.fromMillis(nowMs);
  let offersExpired = 0;
  let cancelled = 0;
  let rematched = 0;

  const expiredOffers = await db.collection(COLLECTIONS.bookings).where("status", "==", BookingStatus.OFFERED).where("offerExpiresAt", "<=", now).limit(100).get();
  for (const doc of expiredOffers.docs) {
    const changed = await db.runTransaction(async (tx) => {
      const [snap, settings] = await Promise.all([tx.get(doc.ref), readSettingsInTx(tx, db)]);
      const booking = readBookingSnapshot(snap);
      if (booking.status !== BookingStatus.OFFERED || !booking.offerExpiresAt || booking.offerExpiresAt.toMillis() > nowMs) return false;
      const technicianId = booking.offeredTechnicianId;
      writeTransition(tx, db, {
        ref: doc.ref,
        booking,
        to: BookingStatus.MATCHING,
        actor: BookingActor.SYSTEM,
        byUid: null,
        note: "The technician didn't respond in time",
        extra: {
          ...backToMatching(booking, settings, nowMs),
          ...(technicianId
            ? { declinedTechnicianIds: FieldValue.arrayUnion(technicianId), participantIds: FieldValue.arrayRemove(technicianId) }
            : {}),
        },
      });
      return true;
    });
    if (changed) {
      offersExpired += 1;
      await rematchIfExhausted(deps, doc.id);
    }
  }

  const overdue = await db
    .collection(COLLECTIONS.bookings)
    .where("status", "in", SEARCHABLE)
    .where("matchingExpiresAt", "<=", now)
    .limit(100)
    .get();
  for (const doc of overdue.docs) {
    const changed = await db.runTransaction(async (tx) => {
      const booking = readBookingSnapshot(await tx.get(doc.ref));
      if (!SEARCHABLE.includes(booking.status) || !booking.matchingExpiresAt || booking.matchingExpiresAt.toMillis() > nowMs) return false;
      const reason = "We couldn't find an available technician in time. Please try again later.";
      writeTransition(tx, db, {
        ref: doc.ref,
        booking,
        to: BookingStatus.CANCELLED,
        actor: BookingActor.SYSTEM,
        byUid: null,
        note: reason,
        extra: { cancellation: { byUid: null, actor: BookingActor.SYSTEM, reason, at: FieldValue.serverTimestamp() } },
      });
      return true;
    });
    if (changed) cancelled += 1;
  }

  const waiting = await db.collection(COLLECTIONS.bookings).where("status", "==", BookingStatus.MATCHING).limit(100).get();
  for (const doc of waiting.docs) {
    const booking = readBookingSnapshot(doc);
    const stale = !booking.lastMatchedAt || booking.lastMatchedAt.toMillis() < nowMs - 5 * 60_000;
    if (stale && selectableCandidates(booking).length === 0) {
      await matchBooking(deps, doc.id);
      rematched += 1;
    }
  }

  return { offersExpired, cancelled, rematched };
}
