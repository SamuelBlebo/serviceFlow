import { describe, expect, it } from "vitest";
import { VerificationStatus } from "../enums";
import { filterEligible, isAvailableAt, rankTechnicians } from "./eligibility";
import type { MatchRequest, MatchableTechnician } from "./types";

const EAST_LEGON = { lat: 5.6494, lng: -0.1531 };
const OSU = { lat: 5.5558, lng: -0.1793 };

const MON_TO_SAT_8_TO_6 = [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "08:00", end: "18:00" }));

function technician(overrides: Partial<MatchableTechnician> = {}): MatchableTechnician {
  return {
    id: "tech-1",
    fullName: "Kwame Owusu",
    averageRating: 4.8,
    completedJobs: 50,
    cancelledJobs: 2,
    offeredJobs: 55,
    respondedJobs: 54,
    verificationStatus: VerificationStatus.VERIFIED,
    isOnline: true,
    serviceIds: ["plumbing"],
    serviceAreas: [{ name: "East Legon", ...EAST_LEGON, radiusKm: 8 }],
    weeklyAvailability: MON_TO_SAT_8_TO_6,
    ...overrides,
  };
}

const request: MatchRequest = {
  serviceId: "plumbing",
  location: EAST_LEGON,
  neededAt: { dayOfWeek: 2, time: "10:30" },
};

describe("filterEligible — hard filters", () => {
  it("accepts a verified, online technician who covers the service, area and time", () => {
    const result = filterEligible([technician()], request);
    expect(result).toHaveLength(1);
    expect(result[0]?.distanceKm).toBeCloseTo(0, 5);
  });

  it.each([
    ["pending verification", { verificationStatus: VerificationStatus.PENDING }],
    ["suspended", { verificationStatus: VerificationStatus.SUSPENDED }],
    ["offline", { isOnline: false }],
    ["doesn't offer the service", { serviceIds: ["electrical"] }],
    ["no availability that day", { weeklyAvailability: [{ day: 0, start: "08:00", end: "18:00" }] }],
    ["customer outside every service area", { serviceAreas: [{ name: "Osu", ...OSU, radiusKm: 2 }] }],
    ["no service areas at all", { serviceAreas: [] }],
  ] as const)("excludes a technician who is %s", (_label, overrides) => {
    expect(filterEligible([technician(overrides)], request)).toEqual([]);
  });

  it("excludes technicians who already declined the booking", () => {
    expect(filterEligible([technician()], { ...request, excludeTechnicianIds: ["tech-1"] })).toEqual([]);
  });

  it("uses the NEAREST covering service area for distance", () => {
    const multiArea = technician({
      serviceAreas: [
        { name: "Osu", ...OSU, radiusKm: 15 },
        { name: "East Legon", lat: EAST_LEGON.lat + 0.01, lng: EAST_LEGON.lng, radiusKm: 5 },
      ],
    });
    const [only] = filterEligible([multiArea], request);
    expect(only?.distanceKm).toBeLessThan(2);
  });
});

describe("isAvailableAt", () => {
  const windows = [{ day: 1, start: "08:00", end: "18:00" }];

  it("is inclusive on both window edges, like the legacy query", () => {
    expect(isAvailableAt(windows, { dayOfWeek: 1, time: "08:00" })).toBe(true);
    expect(isAvailableAt(windows, { dayOfWeek: 1, time: "18:00" })).toBe(true);
  });

  it("rejects times outside the window or on another day", () => {
    expect(isAvailableAt(windows, { dayOfWeek: 1, time: "07:59" })).toBe(false);
    expect(isAvailableAt(windows, { dayOfWeek: 1, time: "18:01" })).toBe(false);
    expect(isAvailableAt(windows, { dayOfWeek: 2, time: "10:00" })).toBe(false);
  });
});

describe("rankTechnicians", () => {
  it("returns at most 3 candidates by default, best first, skipping ineligible ones", () => {
    const pool = [
      technician({ id: "a", averageRating: 3.0 }),
      technician({ id: "b", averageRating: 5.0 }),
      technician({ id: "c", averageRating: 4.0 }),
      technician({ id: "d", averageRating: 4.5 }),
      technician({ id: "offline", averageRating: 5.0, isOnline: false }),
    ];
    const ranked = rankTechnicians(pool, request);
    expect(ranked.map((c) => c.technicianId)).toEqual(["b", "d", "c"]);
  });

  it("is deterministic for identical input", () => {
    const pool = [technician({ id: "x" }), technician({ id: "y" }), technician({ id: "z" })];
    expect(rankTechnicians(pool, request)).toEqual(rankTechnicians([...pool].reverse(), request));
  });

  it("respects a custom limit", () => {
    const pool = ["1", "2", "3", "4", "5"].map((id) => technician({ id }));
    expect(rankTechnicians(pool, { ...request, limit: 5 })).toHaveLength(5);
  });
});
