import { describe, expect, it } from "vitest";
import { distanceKm } from "./geo";

describe("distanceKm", () => {
  it("returns 0 for identical points", () => {
    expect(distanceKm({ lat: 5.6494, lng: -0.1531 }, { lat: 5.6494, lng: -0.1531 })).toBeCloseTo(0, 5);
  });

  it("computes a known approximate distance (East Legon to Osu, Accra)", () => {
    const eastLegon = { lat: 5.6494, lng: -0.1531 };
    const osu = { lat: 5.5558, lng: -0.1793 };
    const km = distanceKm(eastLegon, osu);
    // Straight-line distance is roughly 10-11km — sanity-range check, not a
    // pinned exact value (Haversine is deterministic, but we don't want a
    // brittle test on a 6th decimal place).
    expect(km).toBeGreaterThan(9);
    expect(km).toBeLessThan(12);
  });

  it("is symmetric", () => {
    const a = { lat: 5.6, lng: -0.2 };
    const b = { lat: 5.7, lng: -0.1 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
  });
});
