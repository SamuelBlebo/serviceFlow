import { describe, expect, it } from "vitest";
import { VerificationStatus as V } from "./enums";
import { registerTechnicianInput, reviewTechnicianInput, submitVerificationInput, updateTechnicianServicesInput } from "./schemas/callables";
import {
  assertVerificationTransition,
  canGoOnline,
  canSubmitVerification,
  hasOverlappingWindows,
  normalizeIdNumber,
} from "./technician";

const ALL = Object.values(V);

describe("verification state machine", () => {
  it("allows exactly the documented transitions", () => {
    const allowed: Array<[V, V, "TECHNICIAN" | "ADMIN"]> = [
      [V.UNSUBMITTED, V.PENDING, "TECHNICIAN"],
      [V.REJECTED, V.PENDING, "TECHNICIAN"],
      [V.PENDING, V.VERIFIED, "ADMIN"],
      [V.PENDING, V.REJECTED, "ADMIN"],
      [V.VERIFIED, V.SUSPENDED, "ADMIN"],
      [V.SUSPENDED, V.VERIFIED, "ADMIN"],
    ];
    for (const from of ALL) {
      for (const to of ALL) {
        for (const actor of ["TECHNICIAN", "ADMIN"] as const) {
          const expected = allowed.some(([f, t, a]) => f === from && t === to && a === actor);
          const ok = (() => {
            try {
              assertVerificationTransition(from, to, actor);
              return true;
            } catch {
              return false;
            }
          })();
          expect(ok, `${from} -> ${to} as ${actor}`).toBe(expected);
        }
      }
    }
  });

  it("fixes legacy D-9: a suspended or verified technician cannot resubmit into PENDING", () => {
    expect(canSubmitVerification(V.SUSPENDED)).toBe(false);
    expect(canSubmitVerification(V.VERIFIED)).toBe(false);
    expect(canSubmitVerification(V.PENDING)).toBe(false);
    expect(canSubmitVerification(V.UNSUBMITTED)).toBe(true);
    expect(canSubmitVerification(V.REJECTED)).toBe(true);
  });

  it("a technician can never approve themselves", () => {
    expect(() => assertVerificationTransition(V.PENDING, V.VERIFIED, "TECHNICIAN")).toThrow();
  });

  it("only VERIFIED technicians can go online", () => {
    expect(ALL.filter(canGoOnline)).toEqual([V.VERIFIED]);
  });
});

describe("normalizeIdNumber", () => {
  it("formats Ghana Card numbers however they are typed", () => {
    expect(normalizeIdNumber("GHANA_CARD", "GHA-123456789-0")).toBe("GHA-123456789-0");
    expect(normalizeIdNumber("GHANA_CARD", "gha 1234567890")).toBe("GHA-123456789-0");
    expect(normalizeIdNumber("GHANA_CARD", "1234567890")).toBe("GHA-123456789-0");
  });

  it("rejects malformed Ghana Card numbers", () => {
    expect(normalizeIdNumber("GHANA_CARD", "GHA-12345-0")).toBeNull();
    expect(normalizeIdNumber("GHANA_CARD", "GHA-12345678A-0")).toBeNull();
  });

  it("accepts other document numbers in a permissive alphanumeric format", () => {
    expect(normalizeIdNumber("PASSPORT", "g1234567")).toBe("G1234567");
    expect(normalizeIdNumber("VOTER_ID", "12")).toBeNull();
  });
});

describe("hasOverlappingWindows", () => {
  it("detects overlapping periods on the same day only", () => {
    expect(hasOverlappingWindows([{ day: 1, start: "08:00", end: "12:00" }, { day: 1, start: "11:00", end: "15:00" }])).toBe(true);
    expect(hasOverlappingWindows([{ day: 1, start: "08:00", end: "12:00" }, { day: 1, start: "12:00", end: "15:00" }])).toBe(false);
    expect(hasOverlappingWindows([{ day: 1, start: "08:00", end: "12:00" }, { day: 2, start: "09:00", end: "15:00" }])).toBe(false);
  });
});

describe("technician callable inputs", () => {
  const REQ = "req_12345678";

  it("registerTechnician validates the display name", () => {
    expect(registerTechnicianInput.safeParse({ requestId: REQ, displayName: "Kwame Owusu", yearsExperience: 4 }).success).toBe(true);
    expect(registerTechnicianInput.safeParse({ requestId: REQ, displayName: "K", yearsExperience: 4 }).success).toBe(false);
  });

  it("updateTechnicianServices requires unique services and areas and sane availability", () => {
    const ok = { requestId: REQ, serviceIds: ["plumbing"], areaIds: ["osu"], weeklyAvailability: [{ day: 1, start: "08:00", end: "18:00" }] };
    expect(updateTechnicianServicesInput.safeParse(ok).success).toBe(true);
    expect(updateTechnicianServicesInput.safeParse({ ...ok, serviceIds: [] }).success).toBe(false);
    expect(updateTechnicianServicesInput.safeParse({ ...ok, areaIds: ["osu", "osu"] }).success).toBe(false);
    expect(updateTechnicianServicesInput.safeParse({ ...ok, weeklyAvailability: [{ day: 1, start: "18:00", end: "08:00" }] }).success).toBe(false);
    expect(
      updateTechnicianServicesInput.safeParse({
        ...ok,
        weeklyAvailability: [
          { day: 1, start: "08:00", end: "12:00" },
          { day: 1, start: "11:00", end: "14:00" },
        ],
      }).success,
    ).toBe(false);
  });

  it("submitVerification normalizes the Ghana Card number and requires both photos", () => {
    const base = {
      requestId: REQ,
      submissionId: "s1",
      idType: "GHANA_CARD",
      idNumber: "gha1234567890",
      idPhotoPath: "verifications/u1/s1/id.jpg",
      selfiePath: "verifications/u1/s1/selfie.jpg",
    };
    expect(submitVerificationInput.parse(base).idNumber).toBe("GHA-123456789-0");
    const bad = submitVerificationInput.safeParse({ ...base, idNumber: "GHA-1" });
    expect(bad.error?.issues[0]?.message).toMatch(/GHA-123456789-0/);
    expect(submitVerificationInput.safeParse({ ...base, selfiePath: undefined }).success).toBe(false);
  });

  it("reviewTechnician requires a reason to reject or suspend", () => {
    expect(reviewTechnicianInput.safeParse({ requestId: REQ, technicianId: "t1", decision: "APPROVE" }).success).toBe(true);
    expect(reviewTechnicianInput.safeParse({ requestId: REQ, technicianId: "t1", decision: "REJECT" }).success).toBe(false);
    expect(reviewTechnicianInput.safeParse({ requestId: REQ, technicianId: "t1", decision: "SUSPEND", notes: null }).success).toBe(false);
    expect(
      reviewTechnicianInput.safeParse({ requestId: REQ, technicianId: "t1", decision: "REJECT", notes: "ID photo is blurry" }).success,
    ).toBe(true);
  });
});
