import { PayoutStatus, WalletTransactionType } from "../enums";
import { InvalidStateTransitionError, ValidationError } from "../errors";
import { assertMinorAmount } from "../money";

/**
 * Pure wallet ledger math. The ledger (`wallets/{uid}/transactions`) is the
 * source of truth; `WalletBalances` is a cache that Cloud Functions update in
 * the same transaction as each new entry, using exactly these functions.
 *
 * Balance semantics are preserved from the legacy wallet service:
 *  - availableMinor      — withdrawable now
 *  - pendingPayoutMinor  — reserved by a requested-but-unfinished payout
 *  - lifetimeEarningsMinor — net earnings to date (credits minus commission/adjustment debits)
 */
export interface WalletBalances {
  availableMinor: number;
  pendingPayoutMinor: number;
  lifetimeEarningsMinor: number;
}

export interface LedgerEntryInput {
  type: WalletTransactionType;
  /** Always positive; `type` encodes direction. */
  amountMinor: number;
}

export const EMPTY_BALANCES: WalletBalances = { availableMinor: 0, pendingPayoutMinor: 0, lifetimeEarningsMinor: 0 };

/**
 * Applies one ledger entry and returns the new balances (never mutates).
 * Throws rather than letting `available` or `pending` go negative — with one
 * deliberate exception: COMMISSION_DEBIT may take `available` below zero, to
 * represent commission owed on cash jobs (Decision D5), which future earnings
 * then net off.
 */
export function applyLedgerEntry(balances: WalletBalances, entry: LedgerEntryInput): WalletBalances {
  assertMinorAmount(entry.amountMinor, "amountMinor");
  if (entry.amountMinor === 0) throw new ValidationError("Ledger entries must have a non-zero amount");

  const a = entry.amountMinor;
  const next = { ...balances };

  switch (entry.type) {
    case WalletTransactionType.EARNING_CREDIT:
    case WalletTransactionType.ADJUSTMENT_CREDIT:
      next.availableMinor += a;
      next.lifetimeEarningsMinor += a;
      break;
    case WalletTransactionType.COMMISSION_DEBIT:
      next.availableMinor -= a;
      next.lifetimeEarningsMinor -= a;
      break;
    case WalletTransactionType.ADJUSTMENT_DEBIT:
      next.availableMinor -= a;
      next.lifetimeEarningsMinor -= a;
      assertNotNegative(next.availableMinor, "available balance", entry.type);
      break;
    case WalletTransactionType.WITHDRAWAL_DEBIT:
      next.availableMinor -= a;
      next.pendingPayoutMinor += a;
      assertNotNegative(next.availableMinor, "available balance", entry.type);
      break;
    case WalletTransactionType.WITHDRAWAL_REVERSAL_CREDIT:
      next.availableMinor += a;
      next.pendingPayoutMinor -= a;
      assertNotNegative(next.pendingPayoutMinor, "pending payout balance", entry.type);
      break;
    default: {
      const exhaustive: never = entry.type;
      throw new ValidationError(`Unknown ledger entry type: ${String(exhaustive)}`);
    }
  }

  return next;
}

/**
 * A completed payout has no ledger entry of its own (the WITHDRAWAL_DEBIT
 * already moved the money out of `available`); it only releases the
 * reservation. Mirrors the legacy `completePayout`.
 */
export function releaseCompletedPayout(balances: WalletBalances, amountMinor: number): WalletBalances {
  assertMinorAmount(amountMinor, "amountMinor");
  const next = { ...balances, pendingPayoutMinor: balances.pendingPayoutMinor - amountMinor };
  assertNotNegative(next.pendingPayoutMinor, "pending payout balance", "PAYOUT_COMPLETED");
  return next;
}

/**
 * Recomputes balances from scratch: the full ledger (in order) plus the total
 * of completed payouts. Used by the nightly reconciliation job to detect
 * drift between the cached wallet document and its ledger.
 */
export function reconcile(entries: readonly LedgerEntryInput[], completedPayoutsMinor = 0): WalletBalances {
  const fromLedger = entries.reduce(applyLedgerEntry, EMPTY_BALANCES);
  return completedPayoutsMinor > 0 ? releaseCompletedPayout(fromLedger, completedPayoutsMinor) : fromLedger;
}

export function balancesEqual(a: WalletBalances, b: WalletBalances): boolean {
  return (
    a.availableMinor === b.availableMinor &&
    a.pendingPayoutMinor === b.pendingPayoutMinor &&
    a.lifetimeEarningsMinor === b.lifetimeEarningsMinor
  );
}

/** Deterministic ledger entry IDs — a duplicate `create()` fails, so nothing is ever posted twice. */
export const ledgerEntryId = {
  earning: (bookingId: string) => `earning_${bookingId}`,
  commission: (bookingId: string) => `commission_${bookingId}`,
  withdrawal: (payoutId: string) => `withdrawal_${payoutId}`,
  reversal: (payoutId: string) => `reversal_${payoutId}`,
  adjustment: (adminActionId: string) => `adj_${adminActionId}`,
};

/**
 * Payout lifecycle. COMPLETED and FAILED are final — this is what makes the
 * legacy double-reversal bug (defect D-3) impossible.
 */
const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  [PayoutStatus.PENDING]: [PayoutStatus.PROCESSING, PayoutStatus.COMPLETED, PayoutStatus.FAILED],
  [PayoutStatus.PROCESSING]: [PayoutStatus.COMPLETED, PayoutStatus.FAILED],
  [PayoutStatus.COMPLETED]: [],
  [PayoutStatus.FAILED]: [],
};

export function assertValidPayoutTransition(from: PayoutStatus, to: PayoutStatus): void {
  if (!PAYOUT_TRANSITIONS[from].includes(to)) {
    throw new InvalidStateTransitionError("Payout", from, to);
  }
}

function assertNotNegative(value: number, what: string, cause: string): void {
  if (value < 0) {
    throw new ValidationError(`Insufficient ${what} for ${cause}`);
  }
}
