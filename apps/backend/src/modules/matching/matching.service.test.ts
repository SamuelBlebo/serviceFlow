import { describe, expect, it } from "vitest";
import { computeMatchScore, sortCandidates, type ScorableTechnician } from "./matching.service";

function technician(overrides: Partial<ScorableTechnician> = {}): ScorableTechnician {
  return {
    id: "tech-1",
    fullName: "Test Technician",
    averageRating: 4.5,
    completedJobs: 50,
    cancelledJobs: 5,
    offeredJobs: 60,
    respondedJobs: 58,
    ...overrides,
  };
}

describe("computeMatchScore", () => {
  it("scores a closer technician higher than a farther one, all else equal", () => {
    const near = computeMatchScore(technician(), 1);
    const far = computeMatchScore(technician(), 10);
    expect(near.score).toBeGreaterThan(far.score);
  });

  it("scores a higher-rated technician higher, all else equal", () => {
    const highRated = computeMatchScore(technician({ averageRating: 5 }), 5);
    const lowRated = computeMatchScore(technician({ averageRating: 3 }), 5);
    expect(highRated.score).toBeGreaterThan(lowRated.score);
  });

  it("penalizes a high cancellation rate", () => {
    const reliable = computeMatchScore(technician({ completedJobs: 90, cancelledJobs: 10 }), 5);
    const unreliable = computeMatchScore(technician({ completedJobs: 50, cancelledJobs: 50 }), 5);
    expect(reliable.score).toBeGreaterThan(unreliable.score);
  });

  it("gives a brand-new technician (no job history) a neutral, non-zero score", () => {
    const rookie = computeMatchScore(
      technician({ completedJobs: 0, cancelledJobs: 0, offeredJobs: 0, respondedJobs: 0 }),
      3,
    );
    expect(rookie.score).toBeGreaterThan(0);
  });

  it("never produces a negative distance component even beyond the search radius", () => {
    const veryFar = computeMatchScore(technician(), 100);
    expect(veryFar.scoreBreakdown.distance).toBeGreaterThanOrEqual(0);
  });
});

describe("sortCandidates", () => {
  it("orders by score descending", () => {
    const low = computeMatchScore(technician({ averageRating: 2 }), 5);
    const high = computeMatchScore(technician({ averageRating: 5 }), 5);
    const sorted = sortCandidates([low, high]);
    expect(sorted[0]).toBe(high);
    expect(sorted[1]).toBe(low);
  });

  it("breaks a score tie by distance ascending", () => {
    const a = computeMatchScore(technician({ id: "a" }), 5);
    const b = { ...computeMatchScore(technician({ id: "b" }), 5), score: a.score, distanceKm: 1 };
    const sorted = sortCandidates([a, b]);
    expect(sorted).toHaveLength(2);
    expect(sorted[0]?.technicianProfileId).toBe("b");
  });

  it("is deterministic — never mutates the input array", () => {
    const list = [computeMatchScore(technician({ id: "a" }), 5), computeMatchScore(technician({ id: "b" }), 1)];
    const original = [...list];
    sortCandidates(list);
    expect(list).toEqual(original);
  });
});
