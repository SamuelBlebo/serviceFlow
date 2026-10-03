import { describe, expect, it } from "vitest";
import { isInGhana, isValidCommissionPercent } from "./admin-settings";
import { createCommissionRuleInput, updatePlatformSettingsInput, upsertServiceAreaInput } from "./schemas/callables";

const REQ = "req_12345678";

describe("admin settings limits", () => {
  it("accepts commission percents from 0 to 50 with up to two decimals", () => {
    for (const ok of [0, 12.5, 15, 49.99, 50]) expect(isValidCommissionPercent(ok)).toBe(true);
    for (const bad of [-1, 50.01, 12.345, Number.NaN, 150]) expect(isValidCommissionPercent(bad)).toBe(false);
  });

  it("knows roughly where Ghana is", () => {
    expect(isInGhana({ lat: 5.6037, lng: -0.187 })).toBe(true); // Accra
    expect(isInGhana({ lat: 9.4, lng: -0.85 })).toBe(true); // Tamale
    expect(isInGhana({ lat: 6.52, lng: 3.38 })).toBe(false); // Lagos
    expect(isInGhana({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("admin settings inputs", () => {
  const settings = { requestId: REQ, defaultCommissionPercent: 15, offerTimeoutMinutes: 10, matchingExpiryMinutes: 60, matchRadiusKm: 15, supportPhone: null, cashAllowed: true };

  it("platform settings stay within safe ranges", () => {
    expect(updatePlatformSettingsInput.safeParse(settings).success).toBe(true);
    expect(updatePlatformSettingsInput.safeParse({ ...settings, defaultCommissionPercent: 80 }).success).toBe(false);
    expect(updatePlatformSettingsInput.safeParse({ ...settings, offerTimeoutMinutes: 1 }).success).toBe(false);
    expect(updatePlatformSettingsInput.safeParse({ ...settings, matchRadiusKm: 200 }).success).toBe(false);
    expect(updatePlatformSettingsInput.safeParse({ ...settings, supportPhone: "0241234567" }).success).toBe(true);
    expect(updatePlatformSettingsInput.safeParse({ ...settings, supportPhone: "12345" }).success).toBe(false);
  });

  it("commission rules name their target when scoped", () => {
    expect(createCommissionRuleInput.safeParse({ requestId: REQ, scope: "GLOBAL", percent: 12 }).success).toBe(true);
    expect(createCommissionRuleInput.safeParse({ requestId: REQ, scope: "SERVICE", percent: 12 }).success).toBe(false);
    expect(createCommissionRuleInput.safeParse({ requestId: REQ, scope: "SERVICE", serviceId: "plumbing", percent: 12 }).success).toBe(true);
    expect(createCommissionRuleInput.safeParse({ requestId: REQ, scope: "TECHNICIAN", technicianId: null, percent: 12 }).success).toBe(false);
  });

  it("service areas must be in Ghana with a sensible radius", () => {
    const area = { requestId: REQ, name: "Spintex", city: "Accra", region: "Greater Accra", center: { lat: 5.63, lng: -0.12 }, defaultRadiusKm: 8 };
    expect(upsertServiceAreaInput.safeParse(area).success).toBe(true);
    expect(upsertServiceAreaInput.safeParse({ ...area, center: { lat: 6.52, lng: 3.38 } }).success).toBe(false);
    expect(upsertServiceAreaInput.safeParse({ ...area, defaultRadiusKm: 100 }).success).toBe(false);
    expect(upsertServiceAreaInput.safeParse({ ...area, name: "!!" }).success).toBe(false);
  });
});
