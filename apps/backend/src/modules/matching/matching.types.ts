export interface MatchRequest {
  serviceId: string;
  location: { lat: number; lng: number };
  /** ISO day-of-week (0=Sun..6=Sat) and "HH:mm" the job is needed, for availability filtering. */
  neededAt: { dayOfWeek: number; time: string };
  limit?: number;
}

export interface MatchCandidate {
  technicianProfileId: string;
  fullName: string;
  averageRating: number;
  completedJobs: number;
  distanceKm: number;
  score: number;
  scoreBreakdown: Record<string, number>;
}
