import { ValidationError } from "../errors";
import { assertMinorAmount } from "../money";

export interface CommissionSplit {
  grossMinor: number;
  commissionPercent: number;
  commissionMinor: number;
  technicianNetMinor: number;
}

/**
 * Splits a gross booking price (in pesewas) into platform commission and
 * technician net pay. Integer arithmetic guarantees
 * `commissionMinor + technicianNetMinor === grossMinor` exactly — the legacy
 * float version could only promise that to two decimal places.
 */
export function splitByCommission(grossMinor: number, commissionPercent: number): CommissionSplit {
  assertMinorAmount(grossMinor, "grossMinor");
  assertCommissionPercent(commissionPercent);

  const commissionMinor = Math.round((grossMinor * commissionPercent) / 100);
  const technicianNetMinor = grossMinor - commissionMinor;
  return { grossMinor, commissionPercent, commissionMinor, technicianNetMinor };
}

export function assertCommissionPercent(percent: number): void {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new ValidationError(`Commission percent must be between 0 and 100 (got ${percent})`);
  }
}
