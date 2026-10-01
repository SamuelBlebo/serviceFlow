import type { MatchCandidate, MatchConfig, MatchWeights, ScorableTechnician } from "./types";

/**
 * Deterministic, explainable ranking weights — ported unchanged from the
 * legacy matching service. No ML. Admins may override these through
 * `settings/platform.matchWeights`; these are the defaults.
 */
export const WEIGHTS: MatchWeights = {
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

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  weights: WEIGHTS,
  maxSearchRadiusKm: MAX_SEARCH_RADIUS_KM,
  jobsSaturation: JOBS_SATURATION,
};

/** Pure scoring function — no I/O, directly unit-testable. */
export function computeMatchScore(
  technician: ScorableTechnician,
  distanceToCustomerKm: number,
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): MatchCandidate {
  const { weights } = config;
  const totalDecidedJobs = technician.completedJobs + technician.cancelledJobs;
  const completionRate = totalDecidedJobs > 0 ? technician.completedJobs / totalDecidedJobs : 0.5; // neutral prior for new technicians
  const cancellationRate = totalDecidedJobs > 0 ? technician.cancelledJobs / totalDecidedJobs : 0;
  const responseRate = technician.offeredJobs > 0 ? technician.respondedJobs / technician.offeredJobs : 0.5;

  const distanceScore = clamp01(1 - distanceToCustomerKm / config.maxSearchRadiusKm);
  const ratingScore = clamp01(technician.averageRating / 5);
  const completedJobsScore = clamp01(technician.completedJobs / config.jobsSaturation);
  const completionRateScore = clamp01(completionRate);
  const cancellationScore = clamp01(1 - cancellationRate);
  const responseScore = clamp01(responseRate);

  const scoreBreakdown = {
    distance: distanceScore * weights.distance,
    rating: ratingScore * weights.rating,
    completedJobs: completedJobsScore * weights.completedJobs,
    completionRate: completionRateScore * weights.completionRate,
    cancellationRate: cancellationScore * weights.cancellationRate,
    responseRate: responseScore * weights.responseRate,
  };

  const score = Object.values(scoreBreakdown).reduce((sum, v) => sum + v, 0);

  return {
    technicianId: technician.id,
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
    return a.technicianId.localeCompare(b.technicianId);
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
