import { prisma, VerificationStatus } from "@home-service/database";
import { distanceKm } from "@home-service/shared";
import type { MatchCandidate, MatchRequest } from "./matching.types";

/**
 * Deterministic, explainable ranking weights. Every factor called for in
 * spec §10 is represented; nothing here calls out to an ML model. Tuning
 * these (or swapping in a learned ranker later) only touches this file —
 * callers just get back a ranked MatchCandidate[].
 */
export const WEIGHTS = {
  distance: 0.3,
  rating: 0.25,
  completedJobs: 0.15,
  completionRate: 0.15,
  cancellationRate: 0.1,
  responseRate: 0.05,
};

export const MAX_SEARCH_RADIUS_KM = 15;
/** completedJobs score saturates around this many jobs (diminishing returns beyond it). */
export const JOBS_SATURATION = 100;

export interface ScorableTechnician {
  id: string;
  fullName: string;
  averageRating: number;
  completedJobs: number;
  cancelledJobs: number;
  offeredJobs: number;
  respondedJobs: number;
}

/**
 * Pure scoring function — no DB, no I/O. Kept separate from
 * findMatchingTechnicians so the ranking math itself is directly unit
 * testable without a database.
 */
export function computeMatchScore(technician: ScorableTechnician, distanceToCustomerKm: number): MatchCandidate {
  const totalDecidedJobs = technician.completedJobs + technician.cancelledJobs;
  const completionRate = totalDecidedJobs > 0 ? technician.completedJobs / totalDecidedJobs : 0.5; // neutral prior for new technicians
  const cancellationRate = totalDecidedJobs > 0 ? technician.cancelledJobs / totalDecidedJobs : 0;
  const responseRate = technician.offeredJobs > 0 ? technician.respondedJobs / technician.offeredJobs : 0.5;

  const distanceScore = clamp01(1 - distanceToCustomerKm / MAX_SEARCH_RADIUS_KM);
  const ratingScore = clamp01(technician.averageRating / 5);
  const completedJobsScore = clamp01(technician.completedJobs / JOBS_SATURATION);
  const completionRateScore = clamp01(completionRate);
  const cancellationScore = clamp01(1 - cancellationRate);
  const responseScore = clamp01(responseRate);

  const scoreBreakdown = {
    distance: distanceScore * WEIGHTS.distance,
    rating: ratingScore * WEIGHTS.rating,
    completedJobs: completedJobsScore * WEIGHTS.completedJobs,
    completionRate: completionRateScore * WEIGHTS.completionRate,
    cancellationRate: cancellationScore * WEIGHTS.cancellationRate,
    responseRate: responseScore * WEIGHTS.responseRate,
  };

  const score = Object.values(scoreBreakdown).reduce((sum, v) => sum + v, 0);

  return {
    technicianProfileId: technician.id,
    fullName: technician.fullName,
    averageRating: technician.averageRating,
    completedJobs: technician.completedJobs,
    distanceKm: Math.round(distanceToCustomerKm * 10) / 10,
    score: Math.round(score * 1000) / 1000,
    scoreBreakdown,
  };
}

/** Deterministic ordering: score desc, then distance asc, then id asc as a stable final tiebreaker. */
export function sortCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.technicianProfileId.localeCompare(b.technicianProfileId);
  });
}

/**
 * Finds and ranks eligible technicians for a service request. Only
 * VERIFIED, currently-available technicians offering the requested service
 * are considered — everything else is a ranking signal, not a filter.
 */
export async function findMatchingTechnicians(request: MatchRequest): Promise<MatchCandidate[]> {
  const candidates = await prisma.technicianProfile.findMany({
    where: {
      deletedAt: null,
      verificationStatus: VerificationStatus.VERIFIED,
      isAvailable: true,
      services: { some: { serviceId: request.serviceId } },
      availability: {
        some: {
          dayOfWeek: request.neededAt.dayOfWeek,
          isActive: true,
          startTime: { lte: request.neededAt.time },
          endTime: { gte: request.neededAt.time },
        },
      },
    },
    include: { serviceAreas: true },
  });

  const scored: MatchCandidate[] = [];

  for (const technician of candidates) {
    // Eligible if within radius of ANY of the technician's declared service areas.
    let nearestDistance = Infinity;
    for (const area of technician.serviceAreas) {
      const d = distanceKm(request.location, { lat: area.centerLat, lng: area.centerLng });
      if (d <= area.radiusKm && d < nearestDistance) {
        nearestDistance = d;
      }
    }
    if (!Number.isFinite(nearestDistance)) continue; // no service area covers this location

    scored.push(computeMatchScore(technician, nearestDistance));
  }

  return sortCandidates(scored).slice(0, request.limit ?? 3);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
