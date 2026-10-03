import {
  VerificationStatus,
  commissionRuleDoc,
  customerAddressDoc,
  customerDoc,
  platformSettingsDoc,
  rankTechnicians,
  serviceAreaDoc,
  serviceDoc,
  technicianDoc,
  userDoc,
  walletDoc,
} from "@serviceflow/shared";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_SETTINGS,
  SERVICES,
  SERVICE_AREAS,
  customerAccounts,
  globalCommissionRule,
  technicianAccounts,
} from "./seed-data";

const now = { toMillis: () => Date.UTC(2026, 8, 30) };

function expectValid(schema: { safeParse(v: unknown): { success: boolean; error?: unknown } }, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(result.error)).toBe(true);
}

describe("seed data conforms to the Firestore contract", () => {
  it("services", () => {
    expect(SERVICES).toHaveLength(3);
    for (const s of SERVICES) {
      expectValid(serviceDoc, s.doc);
      expect(s.id).toBe(s.doc.slug);
    }
  });

  it("17 Accra-region service areas", () => {
    expect(SERVICE_AREAS).toHaveLength(17);
    expect(new Set(SERVICE_AREAS.map((a) => a.id)).size).toBe(17);
    for (const a of SERVICE_AREAS) expectValid(serviceAreaDoc, a.doc);
  });

  it("settings and commission", () => {
    expectValid(platformSettingsDoc, PLATFORM_SETTINGS);
    expectValid(commissionRuleDoc, globalCommissionRule(now).doc);
  });

  it("technician and customer accounts", () => {
    const technicians = technicianAccounts(now);
    expect(technicians).toHaveLength(4);
    for (const t of technicians) {
      expectValid(userDoc, t.user);
      expectValid(technicianDoc, t.profile);
      expectValid(walletDoc, t.wallet);
      expect(t.claims).toEqual({ tech: true });
      expect(t.profile.verificationStatus).toBe(VerificationStatus.VERIFIED);
    }
    for (const c of customerAccounts(now)) {
      expectValid(userDoc, c.user);
      expectValid(customerDoc, c.profile);
      for (const a of c.addresses) expectValid(customerAddressDoc, a.doc);
      expect(c.addresses.map((a) => a.id)).toContain(c.profile.defaultAddressId);
      expect(c.claims).toEqual({});
    }
  });
});

describe("seed data is usable by the matching rules", () => {
  it("a plumbing request in East Legon on a Tuesday morning matches the seeded plumbers, nearest first", () => {
    const pool = technicianAccounts(now).map((t) => ({
      id: t.uid,
      fullName: t.profile.displayName,
      averageRating: t.profile.stats.avgRating,
      completedJobs: t.profile.stats.completed,
      cancelledJobs: t.profile.stats.cancelled,
      offeredJobs: t.profile.stats.offered,
      respondedJobs: t.profile.stats.responded,
      verificationStatus: t.profile.verificationStatus,
      isOnline: t.profile.isOnline,
      serviceIds: t.profile.serviceIds,
      serviceAreas: t.profile.serviceAreas,
      weeklyAvailability: t.profile.weeklyAvailability,
    }));

    const ranked = rankTechnicians(pool, {
      serviceId: "plumbing",
      location: { lat: 5.6494, lng: -0.1531 },
      neededAt: { dayOfWeek: 2, time: "10:00" },
    });
    // Kwame covers East Legon directly; Ama's Osu area (8 km radius) does not reach it.
    expect(ranked.map((c) => c.technicianId)).toEqual(["seed-tech-kwame"]);
  });
});
