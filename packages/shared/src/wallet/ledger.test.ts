import { describe, expect, it } from "vitest";
import { PayoutStatus, WalletTransactionType as T } from "../enums";
import {
  EMPTY_BALANCES,
  applyLedgerEntry,
  assertValidPayoutTransition,
  balancesEqual,
  ledgerEntryId,
  reconcile,
  releaseCompletedPayout,
} from "./ledger";

describe("applyLedgerEntry", () => {
  it("credits earnings to available and lifetime", () => {
    expect(applyLedgerEntry(EMPTY_BALANCES, { type: T.EARNING_CREDIT, amountMinor: 20000 })).toEqual({
      availableMinor: 20000,
      pendingPayoutMinor: 0,
      lifetimeEarningsMinor: 20000,
    });
  });

  it("gross credit + commission debit nets to the technician's share (GH₵200 at 15%)", () => {
    const afterEarning = applyLedgerEntry(EMPTY_BALANCES, { type: T.EARNING_CREDIT, amountMinor: 20000 });
    const afterCommission = applyLedgerEntry(afterEarning, { type: T.COMMISSION_DEBIT, amountMinor: 3000 });
    expect(afterCommission.availableMinor).toBe(17000);
    expect(afterCommission.lifetimeEarningsMinor).toBe(17000);
  });

  it("allows commission on a cash job to take the balance negative (commission owed)", () => {
    const owed = applyLedgerEntry(EMPTY_BALANCES, { type: T.COMMISSION_DEBIT, amountMinor: 1500 });
    expect(owed.availableMinor).toBe(-1500);
  });

  it("reserves a withdrawal: available -> pending", () => {
    const funded = { ...EMPTY_BALANCES, availableMinor: 10000, lifetimeEarningsMinor: 10000 };
    expect(applyLedgerEntry(funded, { type: T.WITHDRAWAL_DEBIT, amountMinor: 4000 })).toEqual({
      availableMinor: 6000,
      pendingPayoutMinor: 4000,
      lifetimeEarningsMinor: 10000,
    });
  });

  it("refuses a withdrawal larger than the available balance", () => {
    const funded = { ...EMPTY_BALANCES, availableMinor: 1000 };
    expect(() => applyLedgerEntry(funded, { type: T.WITHDRAWAL_DEBIT, amountMinor: 1001 })).toThrow(/Insufficient/);
  });

  it("reverses a failed withdrawal: pending -> available", () => {
    const reserved = { availableMinor: 6000, pendingPayoutMinor: 4000, lifetimeEarningsMinor: 10000 };
    expect(applyLedgerEntry(reserved, { type: T.WITHDRAWAL_REVERSAL_CREDIT, amountMinor: 4000 })).toEqual({
      availableMinor: 10000,
      pendingPayoutMinor: 0,
      lifetimeEarningsMinor: 10000,
    });
  });

  it("refuses to reverse more than is pending (a second reversal of the same payout)", () => {
    const reserved = { availableMinor: 6000, pendingPayoutMinor: 4000, lifetimeEarningsMinor: 10000 };
    const once = applyLedgerEntry(reserved, { type: T.WITHDRAWAL_REVERSAL_CREDIT, amountMinor: 4000 });
    expect(() => applyLedgerEntry(once, { type: T.WITHDRAWAL_REVERSAL_CREDIT, amountMinor: 4000 })).toThrow();
  });

  it("refuses an adjustment debit that would overdraw the wallet", () => {
    expect(() => applyLedgerEntry(EMPTY_BALANCES, { type: T.ADJUSTMENT_DEBIT, amountMinor: 1 })).toThrow();
  });

  it("rejects zero, negative and fractional amounts", () => {
    for (const amountMinor of [0, -100, 10.5]) {
      expect(() => applyLedgerEntry(EMPTY_BALANCES, { type: T.EARNING_CREDIT, amountMinor })).toThrow();
    }
  });

  it("never mutates its input", () => {
    const input = { ...EMPTY_BALANCES };
    applyLedgerEntry(input, { type: T.EARNING_CREDIT, amountMinor: 500 });
    expect(input).toEqual(EMPTY_BALANCES);
  });
});

describe("releaseCompletedPayout", () => {
  it("releases the reservation without touching available", () => {
    const reserved = { availableMinor: 6000, pendingPayoutMinor: 4000, lifetimeEarningsMinor: 10000 };
    expect(releaseCompletedPayout(reserved, 4000)).toEqual({ ...reserved, pendingPayoutMinor: 0 });
  });

  it("refuses to release more than is pending", () => {
    expect(() => releaseCompletedPayout(EMPTY_BALANCES, 100)).toThrow();
  });
});

describe("reconcile", () => {
  it("rebuilds cached balances from the ledger and completed payouts", () => {
    const entries = [
      { type: T.EARNING_CREDIT, amountMinor: 20000 },
      { type: T.COMMISSION_DEBIT, amountMinor: 3000 },
      { type: T.WITHDRAWAL_DEBIT, amountMinor: 5000 },
      { type: T.WITHDRAWAL_DEBIT, amountMinor: 2000 },
      { type: T.WITHDRAWAL_REVERSAL_CREDIT, amountMinor: 2000 },
    ];
    const expected = { availableMinor: 12000, pendingPayoutMinor: 0, lifetimeEarningsMinor: 17000 };
    const rebuilt = reconcile(entries, 5000);
    expect(rebuilt).toEqual(expected);
    expect(balancesEqual(rebuilt, expected)).toBe(true);
  });

  it("detects drift between a cached wallet and its ledger", () => {
    const cached = { availableMinor: 999999, pendingPayoutMinor: 0, lifetimeEarningsMinor: 17000 };
    const rebuilt = reconcile([{ type: T.EARNING_CREDIT, amountMinor: 17000 }]);
    expect(balancesEqual(cached, rebuilt)).toBe(false);
  });
});

describe("ledgerEntryId", () => {
  it("is deterministic so duplicate postings collide", () => {
    expect(ledgerEntryId.earning("b1")).toBe(ledgerEntryId.earning("b1"));
    expect(ledgerEntryId.reversal("p1")).toBe("reversal_p1");
    expect(ledgerEntryId.earning("b1")).not.toBe(ledgerEntryId.commission("b1"));
  });
});

describe("assertValidPayoutTransition", () => {
  it("allows the normal lifecycle", () => {
    expect(() => assertValidPayoutTransition(PayoutStatus.PENDING, PayoutStatus.PROCESSING)).not.toThrow();
    expect(() => assertValidPayoutTransition(PayoutStatus.PROCESSING, PayoutStatus.COMPLETED)).not.toThrow();
    expect(() => assertValidPayoutTransition(PayoutStatus.PROCESSING, PayoutStatus.FAILED)).not.toThrow();
  });

  it("treats COMPLETED and FAILED as final (fixes legacy double-reversal, defect D-3)", () => {
    expect(() => assertValidPayoutTransition(PayoutStatus.FAILED, PayoutStatus.FAILED)).toThrow();
    expect(() => assertValidPayoutTransition(PayoutStatus.FAILED, PayoutStatus.COMPLETED)).toThrow();
    expect(() => assertValidPayoutTransition(PayoutStatus.COMPLETED, PayoutStatus.FAILED)).toThrow();
  });
});
