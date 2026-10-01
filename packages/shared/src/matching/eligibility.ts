import { VerificationStatus } from "../enums";
import { distanceKm } from "../geo";
import { DEFAULT_MATCH_CONFIG, computeMatchScore, sortCandidates } from "./score";
import type { AvailabilityWindow, MatchCandidate, MatchConfig, MatchRequest, MatchableTechnician } from "./types";

export const DEFAULT_MATCH_LIMIT = 3;

export interface EligibleTechnician<T extends MatchableTechnician = MatchableTechnician> {
  technician: T;
  /** Distance from the customer to the nearest service area that covers them. */
  distanceKm: number;
}

/**
 * The hard filters from the legacy matching query, as a pure function:
 * VERIFIED, online, offers the service, has a weekly window covering the
 * needed day/time, not excluded (declined), and inside the radius of at
 * least one of their service areas. Everything else is a ranking signal.
 */
export function filterEligible<T extends MatchableTechnician>(
  technicians: readonly T[],
  request: MatchRequest,
): EligibleTechnician<T>[] {
  const excluded = new Set(request.excludeTechnicianIds ?? []);
  const eligible: EligibleTechnician<T>[] = [];

  for (const technician of technicians) {
    if (excluded.has(technician.id)) continue;
    if (technician.verificationStatus !== VerificationStatus.VERIFIED) continue;
    if (!technician.isOnline) continue;
    if (!technician.serviceIds.includes(request.serviceId)) continue;
    if (!isAvailableAt(technician.weeklyAvailability, request.neededAt)) continue;

    const nearest = nearestCoveringAreaDistance(technician, request);
    if (nearest === null) continue;

    eligible.push({ technician, distanceKm: nearest });
  }

  return eligible;
}

/** True if any window on that day covers the time (inclusive on both ends, as in the legacy query). */
export function isAvailableAt(
  windows: readonly AvailabilityWindow[],
  neededAt: { dayOfWeek: number; time: string },
): boolean {
  return windows.some((w) => w.day === neededAt.dayOfWeek && w.start <= neededAt.time && w.end >= neededAt.time);
}

function nearestCoveringAreaDistance(technician: MatchableTechnician, request: MatchRequest): number | null {
  let nearest = Infinity;
  for (const area of technician.serviceAreas) {
    const d = distanceKm(request.location, { lat: area.lat, lng: area.lng });
    if (d <= area.radiusKm && d < nearest) nearest = d;
  }
  return Number.isFinite(nearest) ? nearest : null;
}

/**
 * Pure equivalent of the legacy `findMatchingTechnicians`: filter, score,
 * sort, take the top N. The Cloud Function only has to load candidate
 * documents and call this.
 */
export function rankTechnicians(
  technicians: readonly MatchableTechnician[],
  request: MatchRequest,
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): MatchCandidate[] {
  const scored = filterEligible(technicians, request).map(({ technician, distanceKm: d }) =>
    computeMatchScore(technician, d, config),
  );
  return sortCandidates(scored).slice(0, request.limit ?? DEFAULT_MATCH_LIMIT);
}
