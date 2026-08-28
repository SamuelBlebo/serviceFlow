import { prisma, CommissionScope } from "@home-service/database";
import { env } from "../../config/env";

/**
 * Resolves the commission percent to apply, in order of precedence:
 *   1. An active TECHNICIAN-scoped rule for this technician
 *   2. An active SERVICE-scoped rule for this service
 *   3. An active GLOBAL rule
 *   4. env.DEFAULT_COMMISSION_PERCENT as an absolute last resort
 *
 * Nothing here is hard-coded business logic — admins manage all of these
 * rows via the Commission model (see spec §14).
 */
export async function resolveCommissionPercent(params: {
  serviceId: string;
  technicianProfileId?: string | null;
}): Promise<number> {
  if (params.technicianProfileId) {
    const technicianRule = await prisma.commission.findFirst({
      where: {
        scope: CommissionScope.TECHNICIAN,
        technicianProfileId: params.technicianProfileId,
        isActive: true,
      },
    });
    if (technicianRule) return Number(technicianRule.percent);
  }

  const serviceRule = await prisma.commission.findFirst({
    where: { scope: CommissionScope.SERVICE, serviceId: params.serviceId, isActive: true },
  });
  if (serviceRule) return Number(serviceRule.percent);

  const globalRule = await prisma.commission.findFirst({
    where: { scope: CommissionScope.GLOBAL, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (globalRule) return Number(globalRule.percent);

  return env.DEFAULT_COMMISSION_PERCENT;
}

export interface CommissionSplit {
  grossAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  technicianNetAmount: number;
}

/** Splits a gross booking price into platform commission and technician net pay, in GHS. */
export function splitByCommission(grossAmount: number, commissionPercent: number): CommissionSplit {
  const commissionAmount = round2((grossAmount * commissionPercent) / 100);
  const technicianNetAmount = round2(grossAmount - commissionAmount);
  return { grossAmount, commissionPercent, commissionAmount, technicianNetAmount };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
