import { describe, expect, it } from "vitest";
import { assertMinorAmount, formatMoney, formatMoneyRange, fromMinor, isMinorAmount, toMinor } from "./money";

describe("toMinor / fromMinor", () => {
  it("converts cedis to pesewas and back", () => {
    expect(toMinor(12.34)).toBe(1234);
    expect(fromMinor(1234)).toBe(12.34);
  });

  it("rounds away float noise (0.1 + 0.2)", () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });

  it("rejects non-finite input", () => {
    expect(() => toMinor(Number.NaN)).toThrow();
  });
});

describe("isMinorAmount / assertMinorAmount", () => {
  it("accepts non-negative safe integers only", () => {
    expect(isMinorAmount(0)).toBe(true);
    expect(isMinorAmount(2500)).toBe(true);
    expect(isMinorAmount(-1)).toBe(false);
    expect(isMinorAmount(1.5)).toBe(false);
    expect(isMinorAmount("100")).toBe(false);
    expect(() => assertMinorAmount(1.5)).toThrow(/minor units/);
  });
});

describe("formatMoney", () => {
  it("formats GHS with the cedi sign, thousands separators and 2 decimals", () => {
    expect(formatMoney(250000)).toBe("GH₵2,500.00");
    expect(formatMoney(5)).toBe("GH₵0.05");
    expect(formatMoney(0)).toBe("GH₵0.00");
    expect(formatMoney(123456789)).toBe("GH₵1,234,567.89");
  });

  it("formats negative balances", () => {
    expect(formatMoney(-4550)).toBe("-GH₵45.50");
  });

  it("falls back to the ISO code for other currencies", () => {
    expect(formatMoney(1000, "NGN")).toBe("NGN 10.00");
  });

  it("formats a price range", () => {
    expect(formatMoneyRange(10000, 40000)).toBe("GH₵100.00 – GH₵400.00");
    expect(formatMoneyRange(10000, 10000)).toBe("GH₵100.00");
  });
});
