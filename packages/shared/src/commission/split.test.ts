import { describe, expect, it } from "vitest";
import { splitByCommission } from "./split";

// Ported from the legacy commission.service.test.ts, restated in pesewas.
describe("splitByCommission", () => {
  it("splits GH₵200 at 15% into GH₵30 commission / GH₵170 technician net (spec §14 worked example)", () => {
    expect(splitByCommission(20000, 15)).toEqual({
      grossMinor: 20000,
      commissionPercent: 15,
      commissionMinor: 3000,
      technicianNetMinor: 17000,
    });
  });

  it("rounds to the nearest pesewa and the parts always sum exactly to the gross", () => {
    const result = splitByCommission(9999, 12.5);
    expect(result.commissionMinor).toBe(1250);
    expect(result.commissionMinor + result.technicianNetMinor).toBe(9999);
    expect(Number.isInteger(result.commissionMinor)).toBe(true);
    expect(Number.isInteger(result.technicianNetMinor)).toBe(true);
  });

  it("handles 0% commission", () => {
    const result = splitByCommission(15000, 0);
    expect(result.commissionMinor).toBe(0);
    expect(result.technicianNetMinor).toBe(15000);
  });

  it("handles 100% commission", () => {
    const result = splitByCommission(15000, 100);
    expect(result.commissionMinor).toBe(15000);
    expect(result.technicianNetMinor).toBe(0);
  });

  // New coverage
  it("sums exactly for every gross amount from 1 to 5000 pesewas at an awkward rate", () => {
    for (let gross = 1; gross <= 5000; gross++) {
      const { commissionMinor, technicianNetMinor } = splitByCommission(gross, 17.35);
      expect(commissionMinor + technicianNetMinor).toBe(gross);
    }
  });

  it("rejects fractional pesewas, negative amounts and out-of-range percentages", () => {
    expect(() => splitByCommission(100.5, 15)).toThrow();
    expect(() => splitByCommission(-100, 15)).toThrow();
    expect(() => splitByCommission(100, -1)).toThrow();
    expect(() => splitByCommission(100, 101)).toThrow();
  });
});
