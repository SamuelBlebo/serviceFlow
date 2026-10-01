import { describe, expect, it } from "vitest";
import { CommissionScope } from "../enums";
import { type CommissionRuleInput, resolveCommissionPercent } from "./resolve";

const DEFAULT = 15;

function rule(overrides: Partial<CommissionRuleInput>): CommissionRuleInput {
  return { scope: CommissionScope.GLOBAL, percent: 12, isActive: true, createdAtMs: 1, ...overrides };
}

describe("resolveCommissionPercent — precedence TECHNICIAN > SERVICE > GLOBAL > default", () => {
  const rules = [
    rule({ scope: CommissionScope.GLOBAL, percent: 12 }),
    rule({ scope: CommissionScope.SERVICE, serviceId: "plumbing", percent: 10 }),
    rule({ scope: CommissionScope.TECHNICIAN, technicianId: "tech-1", percent: 8 }),
  ];

  it("prefers a technician-specific rule", () => {
    expect(resolveCommissionPercent(rules, { serviceId: "plumbing", technicianId: "tech-1" }, DEFAULT)).toBe(8);
  });

  it("falls back to the service rule for other technicians", () => {
    expect(resolveCommissionPercent(rules, { serviceId: "plumbing", technicianId: "tech-2" }, DEFAULT)).toBe(10);
  });

  it("falls back to the global rule for other services", () => {
    expect(resolveCommissionPercent(rules, { serviceId: "electrical" }, DEFAULT)).toBe(12);
  });

  it("falls back to the platform default when no rule applies", () => {
    expect(resolveCommissionPercent([], { serviceId: "electrical" }, DEFAULT)).toBe(15);
  });

  it("ignores inactive rules", () => {
    const inactive = [rule({ scope: CommissionScope.TECHNICIAN, technicianId: "tech-1", percent: 5, isActive: false })];
    expect(resolveCommissionPercent(inactive, { serviceId: "plumbing", technicianId: "tech-1" }, DEFAULT)).toBe(15);
  });

  it("picks the newest active rule within a scope, deterministically", () => {
    const globals = [
      rule({ percent: 11, createdAtMs: 100 }),
      rule({ percent: 13, createdAtMs: 300 }),
      rule({ percent: 12, createdAtMs: 200 }),
    ];
    expect(resolveCommissionPercent(globals, { serviceId: "x" }, DEFAULT)).toBe(13);
  });

  it("rejects an out-of-range percentage rather than applying it", () => {
    expect(() => resolveCommissionPercent([rule({ percent: 150 })], { serviceId: "x" }, DEFAULT)).toThrow();
  });
});
