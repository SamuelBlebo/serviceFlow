import { doc, onSnapshot } from "@react-native-firebase/firestore";
import { parseDoc, paths, type WithId } from "@serviceflow/firebase";
import { type ConfirmCashPaymentInput, type InitiatePaymentInput, type PaymentDoc, paymentDoc, platformSettingsDoc } from "@serviceflow/shared";
import { call } from "../lib/call";
import { db } from "../lib/firebase";

/** Payments on mobile: watch the server-written payment; change it only through callables. */
export type Payment = WithId<PaymentDoc>;

type Snap = { id: string; data(options?: { serverTimestamps?: "estimate" }): unknown };
const estimated = (s: Snap) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

export function watchPayment(bookingId: string, onData: (p: Payment | null) => void): () => void {
  return onSnapshot(
    doc(db(), paths.payment(bookingId)),
    (s) => onData(s.exists() ? parseDoc(paymentDoc, estimated(s)) : null),
    () => onData(null),
  );
}

export function watchCashAllowed(onData: (allowed: boolean) => void): () => void {
  return onSnapshot(
    doc(db(), paths.platformSettings()),
    (s) => onData(s.exists() ? platformSettingsDoc.parse(s.data()).cashAllowed : true),
    () => onData(false),
  );
}

export const paymentStore = {
  initiate: (input: InitiatePaymentInput) => call("initiatePayment", input),
  confirmCash: (input: ConfirmCashPaymentInput) => call("confirmCashPayment", input),
};
export type PaymentStore = typeof paymentStore;
