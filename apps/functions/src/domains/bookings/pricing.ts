import {
  ConflictError,
  PriceSetBy,
  QuoteStatus,
  ValidationError,
  canAdminSetPrice,
  canRespondToQuote,
  canSubmitQuote,
  formatMoney,
  isQuoteWithinRange,
} from "@serviceflow/shared";
import { FieldValue } from "firebase-admin/firestore";
import { adminActionData, adminActionRef } from "../../lib/audit";
import { type BookingDeps, assertAssignedTechnician, assertCustomer, readBooking, writeReceipt } from "./common";

/*
 * Price authority (Decision D4): the assigned technician quotes within the
 * service's price range, the customer accepts or declines, and work can't
 * start until a price is agreed. An admin can set any price, audited.
 * The final price is locked from the agreed quote at confirmation.
 */

type Done = Promise<{ ok: true; id: string }>;

/** `bookings-submitQuote` (technician). A new quote replaces an unanswered or declined one. */
export async function submitQuote(
  deps: BookingDeps,
  uid: string,
  input: { requestId: string; bookingId: string; amountMinor: number; note?: string },
): Done {
  const { db } = deps;
  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, uid, input.requestId);
    if (done) return;
    assertAssignedTechnician(booking, uid);
    if (!canSubmitQuote(booking.status, booking.pricing.quoteStatus)) {
      throw new ConflictError(
        booking.pricing.quoteStatus === QuoteStatus.ACCEPTED
          ? "The customer has already accepted your price. Contact ServiceFlow support to change it."
          : "You can send a price only before starting the work.",
      );
    }
    if (!isQuoteWithinRange(input.amountMinor, booking.pricing)) {
      const { estimateMinMinor: min, estimateMaxMinor: max, currency } = booking.pricing;
      const message = `Your price must be between ${formatMoney(min, currency)} and ${formatMoney(max, currency)}. For a bigger job, contact ServiceFlow support.`;
      throw new ValidationError(message, [{ path: "amountMinor", message }]);
    }
    tx.update(ref, {
      "pricing.quotedMinor": input.amountMinor,
      "pricing.quoteStatus": QuoteStatus.PROPOSED,
      "pricing.quoteNote": input.note ?? null,
      "pricing.quoteRejectionReason": null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeReceipt(tx, receipt, "submitQuote");
  });
  return { ok: true, id: input.bookingId };
}

/** `bookings-respondToQuote` (customer). */
export async function respondToQuote(
  deps: BookingDeps,
  uid: string,
  input: { requestId: string; bookingId: string; accept: boolean; reason?: string },
): Done {
  const { db } = deps;
  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, uid, input.requestId);
    if (done) return;
    assertCustomer(booking, uid);
    if (!canRespondToQuote(booking.status, booking.pricing.quoteStatus)) {
      throw new ConflictError("There's no price waiting for your answer.");
    }
    tx.update(ref, {
      "pricing.quoteStatus": input.accept ? QuoteStatus.ACCEPTED : QuoteStatus.REJECTED,
      "pricing.priceSetBy": input.accept ? PriceSetBy.TECHNICIAN : null,
      "pricing.quoteRejectionReason": input.accept ? null : (input.reason ?? null),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeReceipt(tx, receipt, input.accept ? "acceptQuote" : "declineQuote");
  });
  return { ok: true, id: input.bookingId };
}

/** `admin-setBookingPrice`: any amount, with a reason, before the customer confirms. Audited. */
export async function setBookingPrice(
  deps: BookingDeps,
  adminUid: string,
  input: { requestId: string; bookingId: string; amountMinor: number; reason: string },
): Done {
  const { db } = deps;
  await db.runTransaction(async (tx) => {
    const { ref, booking, receipt, done } = await readBooking(tx, db, input.bookingId, adminUid, input.requestId);
    if (done) return;
    if (!canAdminSetPrice(booking.status)) {
      throw new ConflictError("The price can be set only after a technician is assigned and before the customer confirms.");
    }
    tx.update(ref, {
      "pricing.quotedMinor": input.amountMinor,
      "pricing.quoteStatus": QuoteStatus.ACCEPTED,
      "pricing.priceSetBy": PriceSetBy.ADMIN,
      "pricing.quoteRejectionReason": null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(
      adminActionRef(db, adminUid, input.requestId),
      adminActionData({
        adminUid,
        actionType: "BOOKING_PRICE_SET",
        targetType: "booking",
        targetId: ref.id,
        before: { quotedMinor: booking.pricing.quotedMinor, quoteStatus: booking.pricing.quoteStatus },
        after: { quotedMinor: input.amountMinor, quoteStatus: QuoteStatus.ACCEPTED },
        reason: input.reason,
        requestId: input.requestId,
      }),
    );
    writeReceipt(tx, receipt, "setPrice");
  });
  return { ok: true, id: input.bookingId };
}
