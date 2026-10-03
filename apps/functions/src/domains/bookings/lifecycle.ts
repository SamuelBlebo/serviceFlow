import { COLLECTIONS, paths } from "@serviceflow/firebase";
import {
  ACTIVE_JOB_STATUSES,
  BookingActor,
  BookingStatus,
  CommissionScope,
  ConflictError,
  DEFAULT_PLATFORM_SETTINGS,
  ForbiddenError,
  NotFoundError,
  QuoteStatus,
  VerificationStatus,
  commissionRuleDoc,
  platformSettingsDoc,
  resolveCommissionPercent,
} from "@serviceflow/shared";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminActionData, adminActionRef } from "../../lib/audit";
import { createInvoice } from "../payments/payments";
import { backToMatching, readSettingsInTx } from "./matching";
import { type BookingDeps, assertAssignedTechnician, assertCustomer, readBooking, writeReceipt, writeTransition } from "./common";

type Done = Promise<{ ok: true; id: string }>;
const ok = (id: string) => ({ ok: true as const, id });

/**
 * `bookings-respondToOffer`: the offered technician accepts (→ ACCEPTED,
 * assigned, busy) or declines (→ MATCHING, excluded from this booking).
 * The response counter is updated in the same transaction (fixes D-8).
 */
export async function respondToOffer(
  deps: BookingDeps,
  uid: string,
  input: { requestId: string; bookingId: string; accept: boolean; reason?: string },
): Done {
  const { db } = deps;
  const nowMs = deps.now?.() ?? Date.now();
  const technicianRef = db.doc(paths.technician(uid));

  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, uid, input.requestId);
    const [technician, settings] = await Promise.all([tx.get(technicianRef), readSettingsInTx(tx, db)]);
    if (done) return;
    if (booking.status !== BookingStatus.OFFERED || booking.offeredTechnicianId !== uid) {
      throw new ConflictError("This job is no longer offered to you.");
    }
    if (booking.offerExpiresAt && booking.offerExpiresAt.toMillis() < nowMs) throw new ConflictError("This offer has expired.");
    if (!technician.exists) throw new NotFoundError("Technician", uid);

    const responded = { "stats.responded": FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
    if (input.accept) {
      if (booking.customerId === uid) throw new ForbiddenError("You can't take your own booking.");
      if (technician.get("verificationStatus") !== VerificationStatus.VERIFIED) {
        throw new ForbiddenError("Only verified providers can accept jobs.");
      }
      const active = technician.get("activeBookingId") as string | null;
      if (active && active !== ref.id) {
        throw new ConflictError("Finish your current job before accepting another.");
      }
      writeTransition(tx, db, {
        ref,
        booking,
        to: BookingStatus.ACCEPTED,
        actor: BookingActor.TECHNICIAN,
        byUid: uid,
        extra: {
          technicianId: uid,
          offeredTechnicianId: null,
          offerExpiresAt: null,
          technicianSnapshot: {
            displayName: technician.get("displayName") as string,
            photoPath: (technician.get("photoPath") as string | null) ?? null,
          },
        },
      });
      tx.update(technicianRef, { ...responded, activeBookingId: ref.id });
    } else {
      writeTransition(tx, db, {
        ref,
        booking,
        to: BookingStatus.MATCHING,
        actor: BookingActor.TECHNICIAN,
        byUid: uid,
        note: input.reason ?? null,
        extra: {
          ...backToMatching(booking, settings, nowMs),
          declinedTechnicianIds: FieldValue.arrayUnion(uid),
          participantIds: FieldValue.arrayRemove(uid),
        },
      });
      tx.update(technicianRef, responded);
    }
    writeReceipt(tx, receipt, input.accept ? "acceptOffer" : "declineOffer");
  });
  return ok(input.bookingId);
}

/**
 * `bookings-advance`: the assigned technician's physical steps (en route →
 * arrived → started → completed). Work can't start until the price is
 * agreed (Decision D4). Completing frees the technician for the next job.
 */
export async function advanceJob(
  deps: BookingDeps,
  uid: string,
  input: { requestId: string; bookingId: string; to: BookingStatus; location?: { lat: number; lng: number }; notes?: string },
): Done {
  const { db } = deps;
  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, uid, input.requestId);
    if (done) return;
    assertAssignedTechnician(booking, uid);
    if (input.to === BookingStatus.IN_PROGRESS && booking.pricing.quoteStatus !== QuoteStatus.ACCEPTED) {
      throw new ConflictError("The customer needs to accept your price before you start the work.");
    }
    writeTransition(tx, db, {
      ref,
      booking,
      to: input.to,
      actor: BookingActor.TECHNICIAN,
      byUid: uid,
      extra: {
        ...(input.to === BookingStatus.EN_ROUTE && input.location ? { enRouteLocation: { lat: input.location.lat, lng: input.location.lng } } : {}),
        ...(input.to === BookingStatus.COMPLETED ? { completionNotes: input.notes ?? null } : {}),
      },
    });
    if (input.to === BookingStatus.COMPLETED) {
      tx.update(db.doc(paths.technician(uid)), { activeBookingId: null, updatedAt: FieldValue.serverTimestamp() });
    }
    writeReceipt(tx, receipt, `advance:${input.to}`);
  });
  return ok(input.bookingId);
}

async function readCommissionPercent(db: Firestore, serviceId: string, technicianId: string): Promise<number> {
  const [rulesSnap, settingsSnap] = await Promise.all([
    db.collection(COLLECTIONS.commissionRules).where("isActive", "==", true).get(),
    db.doc(paths.platformSettings()).get(),
  ]);
  const rules = rulesSnap.docs.flatMap((d) => {
    const parsed = commissionRuleDoc.safeParse(d.data());
    return parsed.success
      ? [
          {
            scope: parsed.data.scope as CommissionScope,
            serviceId: parsed.data.serviceId,
            technicianId: parsed.data.technicianId,
            percent: parsed.data.percent,
            isActive: parsed.data.isActive,
            createdAtMs: parsed.data.createdAt.toMillis(),
          },
        ]
      : [];
  });
  const settings = settingsSnap.exists ? platformSettingsDoc.parse(settingsSnap.data()) : DEFAULT_PLATFORM_SETTINGS;
  return resolveCommissionPercent(rules, { serviceId, technicianId }, settings.defaultCommissionPercent);
}

/**
 * `bookings-confirmCompletion`: the customer confirms the work is done.
 * The server locks the final price (the agreed quote — never a client
 * figure; fixes D-2) and snapshots the commission percent (plan §5.5).
 * The payment invoice (`payments/{bookingId}`) is created in the same transaction.
 */
export async function confirmCompletion(deps: BookingDeps, uid: string, input: { requestId: string; bookingId: string }): Done {
  const { db } = deps;
  // Commission rules change rarely; reading them outside the transaction
  // keeps it small. The snapshot is what the booking records.
  const pre = await db.doc(paths.booking(input.bookingId)).get();
  if (!pre.exists) throw new NotFoundError("Booking", input.bookingId);
  const technicianId = pre.get("technicianId") as string | null;
  const percent = technicianId ? await readCommissionPercent(db, pre.get("serviceId") as string, technicianId) : null;

  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, uid, input.requestId);
    if (done) return;
    assertCustomer(booking, uid);
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new ConflictError("You can confirm only after the technician marks the work as completed.");
    }
    if (booking.pricing.quoteStatus !== QuoteStatus.ACCEPTED || booking.pricing.quotedMinor === null || percent === null) {
      throw new ConflictError("This job has no agreed price yet. Contact ServiceFlow support.");
    }
    writeTransition(tx, db, {
      ref,
      booking,
      to: BookingStatus.CUSTOMER_CONFIRMED,
      actor: BookingActor.CUSTOMER,
      byUid: uid,
      extra: { "pricing.finalMinor": booking.pricing.quotedMinor, "pricing.commissionPercentSnapshot": percent },
    });
    tx.update(db.doc(paths.technician(booking.technicianId!)), {
      "stats.completed": FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // The invoice, from the server-held final price (plan §14.2 step 1).
    createInvoice(tx, db, { ...booking, id: ref.id }, booking.pricing.quotedMinor, percent);
    writeReceipt(tx, receipt, "confirmCompletion");
  });
  return ok(input.bookingId);
}

/**
 * `bookings-cancel` (fixes D-1: ownership is checked). The caller's role on
 * this booking decides the actor — its customer, its assigned technician,
 * or an admin (audited) — and the state machine decides whether that actor
 * may cancel now (e.g. once the technician has arrived only an admin can).
 */
export async function cancelBooking(
  deps: BookingDeps,
  caller: { uid: string; isAdmin: boolean },
  input: { requestId: string; bookingId: string; reason: string },
): Done {
  const { db } = deps;
  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, caller.uid, input.requestId);
    if (done) return;
    const actor =
      booking.customerId === caller.uid
        ? BookingActor.CUSTOMER
        : booking.technicianId === caller.uid
          ? BookingActor.TECHNICIAN
          : caller.isAdmin
            ? BookingActor.ADMIN
            : null;
    if (!actor) throw new ForbiddenError("This isn't your booking.");

    writeTransition(tx, db, {
      ref,
      booking,
      to: BookingStatus.CANCELLED,
      actor,
      byUid: caller.uid,
      note: input.reason,
      extra: {
        offeredTechnicianId: null,
        offerExpiresAt: null,
        cancellation: { byUid: caller.uid, actor, reason: input.reason, at: FieldValue.serverTimestamp() },
      },
    });
    if (booking.technicianId && ACTIVE_JOB_STATUSES.includes(booking.status)) {
      tx.update(db.doc(paths.technician(booking.technicianId)), {
        activeBookingId: null,
        ...(actor === BookingActor.TECHNICIAN ? { "stats.cancelled": FieldValue.increment(1) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (actor === BookingActor.ADMIN) {
      tx.create(
        adminActionRef(db, caller.uid, input.requestId),
        adminActionData({
          adminUid: caller.uid,
          actionType: "BOOKING_CANCELLED",
          targetType: "booking",
          targetId: ref.id,
          before: { status: booking.status },
          after: { status: BookingStatus.CANCELLED },
          reason: input.reason,
          requestId: input.requestId,
        }),
      );
    }
    writeReceipt(tx, receipt, "cancel");
  });
  return ok(input.bookingId);
}

/**
 * `admin-reassignBooking`: takes an offered job back from the technician
 * and returns it to matching (plan §5.1). Audited.
 */
export async function reassignBooking(
  deps: BookingDeps,
  adminUid: string,
  input: { requestId: string; bookingId: string; reason: string },
): Done {
  const { db } = deps;
  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, adminUid, input.requestId);
    const settings = await readSettingsInTx(tx, db);
    if (done) return;
    const offeredTo = booking.offeredTechnicianId;
    writeTransition(tx, db, {
      ref,
      booking,
      to: BookingStatus.MATCHING,
      actor: BookingActor.ADMIN,
      byUid: adminUid,
      note: input.reason,
      extra: {
        ...backToMatching(booking, settings, deps.now?.() ?? Date.now()),
        ...(offeredTo ? { participantIds: FieldValue.arrayRemove(offeredTo) } : {}),
      },
    });
    tx.create(
      adminActionRef(db, adminUid, input.requestId),
      adminActionData({
        adminUid,
        actionType: "BOOKING_REASSIGNED",
        targetType: "booking",
        targetId: ref.id,
        before: { status: booking.status, offeredTechnicianId: offeredTo },
        after: { status: BookingStatus.MATCHING, offeredTechnicianId: null },
        reason: input.reason,
        requestId: input.requestId,
      }),
    );
    writeReceipt(tx, receipt, "reassign");
  });
  return ok(input.bookingId);
}
