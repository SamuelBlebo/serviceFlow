import { CommissionScope } from "../enums";
import { assertCommissionPercent } from "./split";

/** SDK-agnostic view of a `commissionRules/{id}` document. */
export interface CommissionRuleInput {
  scope: CommissionScope;
  serviceId?: string | null;
  technicianId?: string | null;
  percent: number;
  isActive: boolean;
  /** Creation time in epoch milliseconds — the newest active rule wins within a scope. */
  createdAtMs: number;
}

export interface CommissionContext {
  serviceId: string;
  technicianId?: string | null;
}

/**
 * Resolves the commission percent to apply, in order of precedence
 * (unchanged from the legacy commission service):
 *   1. an active TECHNICIAN-scoped rule for this technician
 *   2. an active SERVICE-scoped rule for this service
 *   3. an active GLOBAL rule
 *   4. the platform default (settings/platform.defaultCommissionPercent)
 *
 * Improvement over legacy: when several active rules exist in the same
 * scope, the newest one wins deterministically (legacy picked an arbitrary row).
 */
export function resolveCommissionPercent(
  rules: readonly CommissionRuleInput[],
  context: CommissionContext,
  defaultPercent: number,
): number {
  const active = rules.filter((r) => r.isActive);

  const pick = (predicate: (r: CommissionRuleInput) => boolean): number | undefined => {
    const newest = active.filter(predicate).sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
    return newest?.percent;
  };

  const resolved =
    (context.technicianId
      ? pick((r) => r.scope === CommissionScope.TECHNICIAN && r.technicianId === context.technicianId)
      : undefined) ??
    pick((r) => r.scope === CommissionScope.SERVICE && r.serviceId === context.serviceId) ??
    pick((r) => r.scope === CommissionScope.GLOBAL) ??
    defaultPercent;

  assertCommissionPercent(resolved);
  return resolved;
}
