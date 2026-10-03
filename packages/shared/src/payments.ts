import { BookingStatus, MobileMoneyNetwork, PaymentMethod, PaymentStatus, WalletTransactionType } from "./enums";
import { ledgerEntryId } from "./wallet/ledger";

/**
 * Payment rules shared by Functions (enforcement) and clients (UI hints)
 * — plan §14. Payments happen after the customer confirms completion.
 */

export const PAYMENT_LIMITS = {
  /** Pending Mobile Money attempts older than this are re-verified by the reconciliation job. */
  reconcileAfterMinutes: 10,
} as const;

export const MOBILE_MONEY_NETWORK_LABELS: Record<MobileMoneyNetwork, string> = {
  [MobileMoneyNetwork.MTN_MOMO]: "MTN Mobile Money",
  [MobileMoneyNetwork.TELECEL_CASH]: "Telecel Cash",
  [MobileMoneyNetwork.AT_MONEY]: "AirtelTigo Money",
};

/** Cash-specific progress: the technician confirms they received it. */
export const CashStatus = { AWAITING_TECHNICIAN: "AWAITING_TECHNICIAN", COLLECTED: "COLLECTED" } as const;
export type CashStatus = (typeof CashStatus)[keyof typeof CashStatus];

/**
 * The customer can start (or retry) paying while the booking is confirmed
 * and the payment isn't settled. A pending electronic attempt can be
 * replaced (e.g. the prompt timed out on the phone) — the server verifies
 * the old one first.
 */
export function canInitiatePayment(bookingStatus: BookingStatus, paymentStatus: PaymentStatus): boolean {
  return bookingStatus === BookingStatus.CUSTOMER_CONFIRMED && (paymentStatus === PaymentStatus.PENDING || paymentStatus === PaymentStatus.FAILED);
}

/** "+233241234567" → "+233 24 *** 4567": enough to recognise, never the full number in logs. */
export function maskMsisdn(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} *** ${digits.slice(-4)}`;
}

export interface PlannedLedgerEntry {
  id: string;
  type: WalletTransactionType;
  amountMinor: number;
  description: string;
}

/**
 * Wallet entries posted when a booking is paid (Decision D5):
 * - Mobile Money / card: the platform received the money, so the
 *   technician is credited the gross amount and debited the commission.
 * - Cash: the technician already holds the gross amount, so only the
 *   commission is debited — the balance may go negative (commission owed),
 *   future earnings net it off, and withdrawals wait until it's positive.
 * Zero-amount entries are skipped (e.g. a 0% commission).
 */
export function ledgerEntriesForPayment(
  bookingId: string,
  method: PaymentMethod,
  split: { grossMinor: number; commissionMinor: number },
  serviceName: string,
): PlannedLedgerEntry[] {
  const entries: PlannedLedgerEntry[] = [];
  if (method !== PaymentMethod.CASH && split.grossMinor > 0) {
    entries.push({ id: ledgerEntryId.earning(bookingId), type: WalletTransactionType.EARNING_CREDIT, amountMinor: split.grossMinor, description: `${serviceName} job` });
  }
  if (split.commissionMinor > 0) {
    entries.push({
      id: ledgerEntryId.commission(bookingId),
      type: WalletTransactionType.COMMISSION_DEBIT,
      amountMinor: split.commissionMinor,
      description: method === PaymentMethod.CASH ? `ServiceFlow commission (cash job: ${serviceName})` : `ServiceFlow commission (${serviceName})`,
    });
  }
  return entries;
}

/** Customer-facing wording for each payment status. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: "Waiting for payment",
  [PaymentStatus.SUCCEEDED]: "Paid",
  [PaymentStatus.FAILED]: "Payment failed",
  [PaymentStatus.REFUNDED]: "Refunded",
  [PaymentStatus.PARTIALLY_REFUNDED]: "Partly refunded",
};
