import { COLLECTIONS, parseDoc, parseDocs, paths, type WithId } from "@serviceflow/firebase";
import {
  type ConfirmCashPaymentInput,
  type DevMockPaymentOutcomeInput,
  type InitiatePaymentInput,
  type PaymentDoc,
  type PaymentStatus,
  paymentDoc,
  platformSettingsDoc,
} from "@serviceflow/shared";
import { type DocumentSnapshot, collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { readEnv } from "../env";
import { db } from "../firebase/firestore";
import { call } from "../firebase/functions";

/**
 * Payments (Stage 11). Clients only watch `payments/{bookingId}` (rules: the
 * customer, the technician, admins); every change is a callable, and the
 * server decides when something is paid.
 */
export type Payment = WithId<PaymentDoc>;

const estimated = (s: DocumentSnapshot) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

export function watchPayment(bookingId: string, onData: (p: Payment | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(doc(db(), paths.payment(bookingId)), (s) => onData(s.exists() ? parseDoc(paymentDoc, estimated(s)) : null), onError);
}

/** Whether customers may pay in cash (platform setting, Decision D5). */
export function watchCashAllowed(onData: (allowed: boolean) => void): () => void {
  return onSnapshot(
    doc(db(), paths.platformSettings()),
    (s) => onData(s.exists() ? platformSettingsDoc.parse(s.data()).cashAllowed : true),
    () => onData(false),
  );
}

/** Admin: recent payments, optionally in one status. */
export function watchPayments(status: PaymentStatus | "ALL", onData: (p: Payment[]) => void, onError: (e: Error) => void): () => void {
  const base = collection(db(), COLLECTIONS.payments);
  const q = status === "ALL" ? query(base, orderBy("createdAt", "desc"), limit(100)) : query(base, where("status", "==", status), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => onData(parseDocs(paymentDoc, snap.docs.map(estimated))), onError);
}

/** The local emulator's mock provider lets the page play the payer's phone. */
export const isEmulator = () => {
  try {
    return readEnv().VITE_USE_EMULATORS;
  } catch {
    return false;
  }
};

export const paymentStore = {
  initiate: (input: InitiatePaymentInput) => call("initiatePayment", input),
  confirmCash: (input: ConfirmCashPaymentInput) => call("confirmCashPayment", input),
  simulateOutcome: (input: DevMockPaymentOutcomeInput) => call("devMockPaymentOutcome", input),
};
export type PaymentStore = typeof paymentStore;
