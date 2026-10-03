import { COLLECTIONS, paths } from "@serviceflow/firebase";
import {
  BookingActor,
  BookingStatus,
  CashStatus,
  ConflictError,
  DEFAULT_PLATFORM_SETTINGS,
  ForbiddenError,
  type MobileMoneyNetwork,
  NotFoundError,
  PAYMENT_LIMITS,
  PaymentMethod,
  PaymentStatus,
  ValidationError,
  type WalletBalances,
  applyLedgerEntry,
  canInitiatePayment,
  ledgerEntriesForPayment,
  maskMsisdn,
  normalizeGhanaPhone,
  paymentDoc,
  platformSettingsDoc,
  splitByCommission,
} from "@serviceflow/shared";
import { FieldValue, type Firestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import type { ParsedWebhookEvent, PaymentProvider, VerifyResult } from "../../integrations/payments/payment-provider";
import { type Booking, readBookingSnapshot, writeTransition } from "../bookings/common";

/*
 * Payments (plan §14, Decision D5). The invoice is created when the customer
 * confirms completion; the client never reports success — the server only
 * finalises after verifying with the provider (or, for cash, after the
 * technician confirms receipt). Finalisation is one transaction: payment
 * SUCCEEDED, booking PAID (SYSTEM) and the wallet ledger entries.
 */

export interface PaymentDeps {
  db: Firestore;
  provider: PaymentProvider;
  now?: () => number;
}

type Payment = ReturnType<typeof paymentDoc.parse>;

/**
 * Creates `payments/{bookingId}` (PENDING) inside the confirmation
 * transaction, from the server-held final price and commission snapshot.
 */
export function createInvoice(tx: Transaction, db: Firestore, booking: Booking & { id: string }, finalMinor: number, commissionPercent: number): void {
  const split = splitByCommission(finalMinor, commissionPercent);
  tx.create(db.doc(paths.payment(booking.id)), {
    customerId: booking.customerId,
    technicianId: booking.technicianId,
    amountMinor: split.grossMinor,
    commissionMinor: split.commissionMinor,
    technicianNetMinor: split.technicianNetMinor,
    commissionPercent,
    refundedMinor: 0,
    currency: booking.pricing.currency,
    method: null,
    status: PaymentStatus.PENDING,
    provider: null,
    providerReference: null,
    attempts: 0,
    lastAttemptAt: null,
    failureReason: null,
    cashStatus: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });
}

/**
 * The one finalisation path (electronic or cash). A no-op if the payment is
 * already settled. Electronic payments must match the provider's verified
 * reference, amount and currency exactly.
 */
async function finalize(deps: PaymentDeps, bookingId: string, how: { verified: VerifyResult } | { cashConfirmedBy: string }): Promise<"paid" | "already" | "mismatch"> {
  const { db } = deps;
  const paymentRef = db.doc(paths.payment(bookingId));
  const bookingRef = db.doc(paths.booking(bookingId));

  return db.runTransaction(async (tx) => {
    const [paymentSnap, bookingSnap] = await Promise.all([tx.get(paymentRef), tx.get(bookingRef)]);
    if (!paymentSnap.exists || !bookingSnap.exists) throw new NotFoundError("Payment", bookingId);
    const payment = paymentDoc.parse(paymentSnap.data());
    if (payment.status === PaymentStatus.SUCCEEDED) return "already";
    const walletRef = db.doc(paths.wallet(payment.technicianId));
    const walletSnap = await tx.get(walletRef);

    if ("verified" in how) {
      const v = how.verified;
      if (v.status !== "SUCCEEDED" || v.reference !== payment.providerReference || v.amountMinor !== payment.amountMinor || v.currency !== payment.currency) {
        logger.error("Payment verification mismatch — not finalised", { bookingId, reference: v.reference, amountMinor: v.amountMinor, expected: payment.amountMinor });
        tx.update(paymentRef, { status: PaymentStatus.FAILED, failureReason: "The payment couldn't be verified. Please try again.", updatedAt: FieldValue.serverTimestamp() });
        return "mismatch";
      }
    } else if (payment.method !== PaymentMethod.CASH || payment.cashStatus !== CashStatus.AWAITING_TECHNICIAN) {
      throw new ConflictError("This payment isn't waiting for a cash confirmation.");
    }

    const booking = readBookingSnapshot(bookingSnap);
    writeTransition(tx, db, { ref: bookingRef, booking, to: BookingStatus.PAID, actor: BookingActor.SYSTEM, byUid: null, note: payment.method === PaymentMethod.CASH ? "Paid in cash" : "Paid by Mobile Money" });

    // Ledger (Decision D5): entries are immutable, their ids deterministic, and
    // the cached balances change only here, in the same transaction.
    const w = walletSnap.data() ?? {};
    let balances: WalletBalances = {
      availableMinor: w.availableMinor ?? 0,
      pendingPayoutMinor: w.pendingPayoutMinor ?? 0,
      lifetimeEarningsMinor: w.lifetimeEarningsMinor ?? 0,
    };
    const entries = ledgerEntriesForPayment(bookingId, payment.method!, { grossMinor: payment.amountMinor, commissionMinor: payment.commissionMinor }, booking.serviceSnapshot.name);
    for (const entry of entries) {
      balances = applyLedgerEntry(balances, entry);
      tx.create(db.doc(paths.walletTransaction(payment.technicianId, entry.id)), {
        type: entry.type,
        amountMinor: entry.amountMinor,
        balanceAfter: { availableMinor: balances.availableMinor, pendingPayoutMinor: balances.pendingPayoutMinor },
        bookingId,
        payoutId: null,
        description: entry.description,
        createdBy: "SYSTEM",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(
      walletRef,
      {
        ...balances,
        currency: payment.currency,
        lastEntryId: entries.at(-1)?.id ?? (w.lastEntryId ?? null),
        entryCount: (w.entryCount ?? 0) + entries.length,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.update(paymentRef, {
      status: PaymentStatus.SUCCEEDED,
      failureReason: null,
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...("cashConfirmedBy" in how ? { cashStatus: CashStatus.COLLECTED } : {}),
    });
    if ("verified" in how && payment.attempts > 0) {
      tx.update(db.doc(`${paths.paymentTransactions(bookingId)}/${payment.attempts}`), { status: "SUCCEEDED", updatedAt: FieldValue.serverTimestamp() });
    }
    return "paid";
  });
}

/** Marks the current electronic attempt failed (the customer can retry). */
async function failAttempt(deps: PaymentDeps, bookingId: string, reference: string, reason: string): Promise<void> {
  const { db } = deps;
  const paymentRef = db.doc(paths.payment(bookingId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(paymentRef);
    if (!snap.exists) return;
    const payment = paymentDoc.parse(snap.data());
    if (payment.status !== PaymentStatus.PENDING || payment.providerReference !== reference) return;
    tx.update(paymentRef, { status: PaymentStatus.FAILED, failureReason: reason, updatedAt: FieldValue.serverTimestamp() });
    tx.update(db.doc(`${paths.paymentTransactions(bookingId)}/${payment.attempts}`), { status: "FAILED", updatedAt: FieldValue.serverTimestamp() });
  });
}

/** Re-verifies a reference with the provider and settles accordingly. */
async function settleFromProvider(deps: PaymentDeps, bookingId: string, reference: string): Promise<"paid" | "already" | "mismatch" | "failed" | "pending"> {
  const verified = await deps.provider.verifyPayment(reference);
  if (verified.status === "SUCCEEDED") return finalize(deps, bookingId, { verified });
  if (verified.status === "FAILED") {
    await failAttempt(deps, bookingId, reference, "The payment was declined or cancelled. Please try again.");
    return "failed";
  }
  return "pending";
}

/**
 * `payments-initiate` (the booking's customer). Mobile Money sends a prompt
 * to the payer's phone (idempotency key `bookingId:attempt`); cash records
 * the choice and waits for the technician to confirm receipt.
 */
export async function initiatePayment(
  deps: PaymentDeps,
  uid: string,
  input: { requestId: string; bookingId: string; method: PaymentMethod; msisdn?: string; network?: MobileMoneyNetwork },
): Promise<{ ok: true; id: string; status: "PENDING" | "SUCCEEDED" | "FAILED" }> {
  const { db } = deps;
  const nowMs = deps.now?.() ?? Date.now();
  const paymentRef = db.doc(paths.payment(input.bookingId));
  const receiptRef = db.doc(`${paths.payment(input.bookingId)}/requests/${uid}_${input.requestId}`);
  if (input.method === PaymentMethod.CARD) throw new ValidationError("Card payments aren't available yet. Use Mobile Money or cash.");

  // A pending electronic attempt is re-verified before a new one replaces it,
  // so a payment that already went through is never charged again.
  const before = await paymentRef.get();
  if (before.exists) {
    const p = paymentDoc.parse(before.data());
    if (p.status === PaymentStatus.PENDING && p.method === PaymentMethod.MOBILE_MONEY && p.providerReference) {
      const outcome = await settleFromProvider(deps, input.bookingId, p.providerReference);
      if (outcome === "paid" || outcome === "already") return { ok: true, id: input.bookingId, status: "SUCCEEDED" };
    }
  }

  const reserved = await db.runTransaction(async (tx) => {
    const [receipt, paymentSnap, bookingSnap, settingsSnap] = await Promise.all([
      tx.get(receiptRef),
      tx.get(paymentRef),
      tx.get(db.doc(paths.booking(input.bookingId))),
      tx.get(db.doc(paths.platformSettings())),
    ]);
    if (!paymentSnap.exists || !bookingSnap.exists) throw new NotFoundError("Payment", input.bookingId);
    const payment = paymentDoc.parse(paymentSnap.data());
    if (payment.customerId !== uid) throw new ForbiddenError("This isn't your booking.");
    if (receipt.exists) return { attempt: receipt.get("attempt") as number | null, payment, repeat: true };
    const booking = readBookingSnapshot(bookingSnap);
    if (!canInitiatePayment(booking.status, payment.status)) {
      throw new ConflictError(payment.status === PaymentStatus.SUCCEEDED ? "This booking is already paid." : "This booking isn't ready for payment.");
    }
    const settings = settingsSnap.exists ? platformSettingsDoc.parse(settingsSnap.data()) : DEFAULT_PLATFORM_SETTINGS;

    if (input.method === PaymentMethod.CASH) {
      if (!settings.cashAllowed) throw new ConflictError("Cash payment isn't available. Please pay with Mobile Money.");
      tx.update(paymentRef, {
        method: PaymentMethod.CASH,
        status: PaymentStatus.PENDING,
        provider: null,
        providerReference: null,
        cashStatus: CashStatus.AWAITING_TECHNICIAN,
        failureReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(receiptRef, { attempt: null, createdAt: FieldValue.serverTimestamp() });
      return { attempt: null, payment, repeat: false };
    }

    const attempt = payment.attempts + 1;
    tx.update(paymentRef, {
      method: PaymentMethod.MOBILE_MONEY,
      status: PaymentStatus.PENDING,
      provider: deps.provider.id,
      providerReference: null,
      attempts: attempt,
      lastAttemptAt: Timestamp.fromMillis(nowMs),
      cashStatus: null,
      failureReason: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(db.doc(`${paths.paymentTransactions(input.bookingId)}/${attempt}`), {
      attempt,
      method: PaymentMethod.MOBILE_MONEY,
      provider: deps.provider.id,
      reference: null,
      status: "PENDING",
      msisdnMasked: input.msisdn ? maskMsisdn(normalizeGhanaPhone(input.msisdn) ?? input.msisdn) : null,
      network: input.network ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(receiptRef, { attempt, createdAt: FieldValue.serverTimestamp() });
    return { attempt, payment, repeat: false };
  });

  if (reserved.attempt === null) return { ok: true, id: input.bookingId, status: "PENDING" };

  // Same attempt number on a retried request → same idempotency key → no second charge.
  const result = await deps.provider.initiatePayment({
    paymentId: input.bookingId,
    amountMinor: reserved.payment.amountMinor,
    currency: reserved.payment.currency,
    method: PaymentMethod.MOBILE_MONEY,
    msisdn: input.msisdn ? (normalizeGhanaPhone(input.msisdn) ?? undefined) : undefined,
    network: input.network,
    idempotencyKey: `${input.bookingId}:${reserved.attempt}`,
  });
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(paymentRef);
    if (paymentDoc.parse(snap.data()).attempts !== reserved.attempt) return; // superseded by a newer attempt
    tx.update(paymentRef, { providerReference: result.reference, updatedAt: FieldValue.serverTimestamp() });
    tx.update(db.doc(`${paths.paymentTransactions(input.bookingId)}/${reserved.attempt}`), { reference: result.reference, updatedAt: FieldValue.serverTimestamp() });
  });

  if (result.status === "PENDING") return { ok: true, id: input.bookingId, status: "PENDING" };
  const outcome = await settleFromProvider(deps, input.bookingId, result.reference);
  return { ok: true, id: input.bookingId, status: outcome === "paid" || outcome === "already" ? "SUCCEEDED" : outcome === "pending" ? "PENDING" : "FAILED" };
}

/** `payments-confirmCash` (the assigned technician): "I received the cash". */
export async function confirmCashPayment(deps: PaymentDeps, uid: string, input: { requestId: string; bookingId: string }): Promise<{ ok: true; id: string }> {
  const snap = await deps.db.doc(paths.payment(input.bookingId)).get();
  if (!snap.exists) throw new NotFoundError("Payment", input.bookingId);
  const payment = paymentDoc.parse(snap.data());
  if (payment.technicianId !== uid) throw new ForbiddenError("This job isn't assigned to you.");
  if (payment.status === PaymentStatus.SUCCEEDED) return { ok: true, id: input.bookingId }; // retry
  await finalize(deps, input.bookingId, { cashConfirmedBy: uid });
  return { ok: true, id: input.bookingId };
}

/**
 * A provider webhook (signature already verified by the adapter): de-duplicated
 * by event id, then the reference is re-verified server-to-server — the
 * webhook body alone never settles a payment.
 */
export async function handlePaymentEvent(deps: PaymentDeps, event: ParsedWebhookEvent): Promise<"duplicate" | "unknown" | string> {
  const { db } = deps;
  const eventRef = db.doc(paths.paymentWebhookEvent(deps.provider.id, event.eventId));
  try {
    await eventRef.create({ type: event.type, reference: event.reference, status: event.status, receivedAt: FieldValue.serverTimestamp() });
  } catch {
    return "duplicate";
  }
  const match = await db.collection(COLLECTIONS.payments).where("providerReference", "==", event.reference).limit(1).get();
  if (match.empty) {
    logger.warn("Webhook for an unknown payment reference", { reference: event.reference });
    return "unknown";
  }
  return settleFromProvider(deps, match.docs[0]!.id, event.reference);
}

/** Scheduled: re-verifies Mobile Money attempts left pending (a webhook may have been lost). */
export async function reconcilePayments(deps: PaymentDeps): Promise<{ checked: number; paid: number; failed: number }> {
  const nowMs = deps.now?.() ?? Date.now();
  const cutoff = Timestamp.fromMillis(nowMs - PAYMENT_LIMITS.reconcileAfterMinutes * 60_000);
  const pending = await deps.db
    .collection(COLLECTIONS.payments)
    .where("status", "==", PaymentStatus.PENDING)
    .where("lastAttemptAt", "<=", cutoff)
    .limit(100)
    .get();
  let paid = 0;
  let failed = 0;
  for (const doc of pending.docs) {
    const p = paymentDoc.parse(doc.data());
    if (p.method !== PaymentMethod.MOBILE_MONEY || !p.providerReference) continue;
    const outcome = await settleFromProvider(deps, doc.id, p.providerReference);
    if (outcome === "paid") paid += 1;
    if (outcome === "failed" || outcome === "mismatch") failed += 1;
  }
  return { checked: pending.size, paid, failed };
}

export type { Payment };
