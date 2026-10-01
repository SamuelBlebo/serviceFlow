import type { VerificationStatus } from "../enums";

export interface LatLng {
  lat: number;
  lng: number;
}

/** A technician's declared coverage: a centre point and a radius. */
export interface ServiceAreaCoverage extends LatLng {
  name: string;
  radiusKm: number;
  areaId?: string;
}

/** One weekly working window, "HH:mm" 24h in the platform time zone. 0 = Sunday .. 6 = Saturday. */
export interface AvailabilityWindow {
  day: number;
  start: string;
  end: string;
}

/** The ranking signals used by `computeMatchScore`. Server-computed; never client-editable. */
export interface ScorableTechnician {
  id: string;
  fullName: string;
  averageRating: number;
  completedJobs: number;
  cancelledJobs: number;
  offeredJobs: number;
  respondedJobs: number;
}

/** Everything needed to decide eligibility (hard filters) and ranking for one technician. */
export interface MatchableTechnician extends ScorableTechnician {
  verificationStatus: VerificationStatus;
  isOnline: boolean;
  serviceIds: readonly string[];
  serviceAreas: readonly ServiceAreaCoverage[];
  weeklyAvailability: readonly AvailabilityWindow[];
}

export interface MatchRequest {
  serviceId: string;
  location: LatLng;
  /** Day-of-week (0=Sun..6=Sat) and "HH:mm" the job is needed, in the platform time zone. */
  neededAt: { dayOfWeek: number; time: string };
  /** Technicians who already declined this booking. */
  excludeTechnicianIds?: readonly string[];
  limit?: number;
}

export interface MatchWeights {
  distance: number;
  rating: number;
  completedJobs: number;
  completionRate: number;
  cancellationRate: number;
  responseRate: number;
}

export interface MatchConfig {
  weights: MatchWeights;
  /** Distance at which the distance score reaches 0. */
  maxSearchRadiusKm: number;
  /** completedJobs score saturates around this many jobs. */
  jobsSaturation: number;
}

export interface MatchCandidate {
  technicianId: string;
  fullName: string;
  averageRating: number;
  completedJobs: number;
  distanceKm: number;
  score: number;
  scoreBreakdown: Record<keyof MatchWeights, number>;
}
