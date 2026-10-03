import { describe, expect, it } from "vitest";
import { BookingStatus, PaymentMethod, PaymentStatus } from "./enums";
import { canInitiatePayment, ledgerEntriesForPayment, maskMsisdn } from "./payments";
import { EMPTY_BALANCES, applyLedgerEntry } from "./wallet/ledger";
import { splitByCommission } from "./commission/split";

describe("payments", () => {
  it("lets the customer pay or retry only after confirming, until the payment settles", () => {
    expect(canInitiatePayment(BookingStatus.CUSTOMER_CONFIRMED, PaymentStatus.PENDING)).toBe(true);
    expect(canInitiatePayment(BookingStatus.CUSTOMER_CONFIRMED, PaymentStatus.FAILED)).toBe(true);
    expect(canInitiatePayment(BookingStatus.CUSTOMER_CONFIRMED, PaymentStatus.SUCCEEDED)).toBe(false);
    expect(canInitiatePayment(BookingStatus.COMPLETED, PaymentStatus.PENDING)).toBe(false);
    expect(canInitiatePayment(BookingStatus.PAID, PaymentStatus.PENDING)).toBe(false);
  });

  it("masks phone numbers for logs and records", () => {
    expect(maskMsisdn("+233241234567")).toBe("+233 24 *** 4567");
    expect(maskMsisdn("12")).toBe("***");
  });
});

describe("ledger entries per payment (Decision D5)", () => {
  const split = splitByCommission(25000, 15); // GH₵250 at 15% → 3750 commission

  it("Mobile Money: credit the gross, debit the commission — net equals the technician's share", () => {
    const entries = ledgerEntriesForPayment("bk_1", PaymentMethod.MOBILE_MONEY, split, "Plumbing");
    expect(entries.map((e) => [e.id, e.type, e.amountMinor])).toEqual([
      ["earning_bk_1", "EARNING_CREDIT", 25000],
      ["commission_bk_1", "COMMISSION_DEBIT", 3750],
    ]);
    const balances = entries.reduce(applyLedgerEntry, EMPTY_BALANCES);
    expect(balances.availableMinor).toBe(split.technicianNetMinor);
  });

  it("cash: only the commission is debited, so the balance shows commission owed", () => {
    const entries = ledgerEntriesForPayment("bk_2", PaymentMethod.CASH, split, "Plumbing");
    expect(entries.map((e) => [e.id, e.type, e.amountMinor])).toEqual([["commission_bk_2", "COMMISSION_DEBIT", 3750]]);
    expect(entries[0]!.description).toMatch(/cash job/);
    expect(entries.reduce(applyLedgerEntry, EMPTY_BALANCES).availableMinor).toBe(-3750);
  });

  it("a later Mobile Money job nets off commission owed from a cash job", () => {
    const cash = ledgerEntriesForPayment("bk_2", PaymentMethod.CASH, split, "Plumbing");
    const momo = ledgerEntriesForPayment("bk_3", PaymentMethod.MOBILE_MONEY, split, "Plumbing");
    const balances = [...cash, ...momo].reduce(applyLedgerEntry, EMPTY_BALANCES);
    expect(balances.availableMinor).toBe(split.technicianNetMinor - split.commissionMinor);
  });

  it("skips zero-amount entries (0% commission)", () => {
    const entries = ledgerEntriesForPayment("bk_4", PaymentMethod.MOBILE_MONEY, splitByCommission(10000, 0), "Plumbing");
    expect(entries.map((e) => e.type)).toEqual(["EARNING_CREDIT"]);
    expect(ledgerEntriesForPayment("bk_5", PaymentMethod.CASH, splitByCommission(10000, 0), "Plumbing")).toEqual([]);
  });
});
