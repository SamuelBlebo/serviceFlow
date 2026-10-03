/**
 * Limits for what admins may configure (Stage 10). Server and admin forms
 * share them; anything outside is refused, so a typo can't, say, set a 500%
 * commission or a matching radius that covers the whole country.
 */
export const SETTINGS_LIMITS = {
  commissionPercentMax: 50,
  offerTimeoutMinutes: { min: 2, max: 60 },
  matchingExpiryMinutes: { min: 10, max: 24 * 60 },
  matchRadiusKm: { min: 2, max: 50 },
  areaRadiusKm: { min: 1, max: 30 },
  areaNameMax: 60,
} as const;

/** Rough bounding box of Ghana — service areas must be inside it. */
export const GHANA_BOUNDS = { minLat: 4.5, maxLat: 11.2, minLng: -3.3, maxLng: 1.3 } as const;

export function isInGhana(p: { lat: number; lng: number }): boolean {
  return p.lat >= GHANA_BOUNDS.minLat && p.lat <= GHANA_BOUNDS.maxLat && p.lng >= GHANA_BOUNDS.minLng && p.lng <= GHANA_BOUNDS.maxLng;
}

/** Commission percents are kept to two decimal places (e.g. 12.5). */
export function isValidCommissionPercent(p: number): boolean {
  return Number.isFinite(p) && p >= 0 && p <= SETTINGS_LIMITS.commissionPercentMax && Math.round(p * 100) === p * 100;
}
