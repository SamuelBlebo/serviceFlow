import { describe, expect, it } from "vitest";
import { splitByCommission } from "./commission.service";

describe("splitByCommission", () => {
  it("splits GH₵200 at 15% into GH₵30 commission / GH₵170 technician net (spec §14 worked example)", () => {
    const result = splitByCommission(200, 15);
    expect(result).toEqual({
      grossAmount: 200,
      commissionPercent: 15,
      commissionAmount: 30,
      technicianNetAmount: 170,
    });
  });

  it("rounds to the nearest pesewa (2 decimal places)", () => {
    const result = splitByCommission(99.99, 12.5);
    expect(result.commissionAmount + result.technicianNetAmount).toBeCloseTo(99.99, 2);
    expect(Number.isInteger(result.commissionAmount * 100)).toBe(true);
    expect(Number.isInteger(result.technicianNetAmount * 100)).toBe(true);
  });

  it("handles 0% commission", () => {
    const result = splitByCommission(150, 0);
    expect(result.commissionAmount).toBe(0);
    expect(result.technicianNetAmount).toBe(150);
  });

  it("handles 100% commission", () => {
    const result = splitByCommission(150, 100);
    expect(result.commissionAmount).toBe(150);
    expect(result.technicianNetAmount).toBe(0);
  });
});
