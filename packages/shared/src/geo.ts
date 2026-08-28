/**
 * Haversine great-circle distance in kilometers. Good enough for
 * neighborhood-scale matching (Accra); not for turn-by-turn routing.
 */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
