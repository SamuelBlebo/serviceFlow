import { paths } from "@serviceflow/firebase";
import { AppError, DEFAULT_PLATFORM_SETTINGS, platformSettingsDoc, serviceAreaDoc } from "@serviceflow/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminActionRef } from "../../lib/audit";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { createCommissionRule, setCommissionRuleActive, setServiceAreaActive, updatePlatformSettings, upsertServiceArea } from "./settings";

const { db } = adminClients();
const deps = { db };
const ADMIN = "admin-1";
let n = 0;
const req = () => `req_settings_${++n}_${Date.now()}`;

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  return err as AppError;
}

const settings = { defaultCommissionPercent: 15, offerTimeoutMinutes: 10, matchingExpiryMinutes: 60, matchRadiusKm: 15, cashAllowed: true };

beforeEach(async () => {
  await resetEmulators();
  await db.doc(paths.platformSettings()).set(DEFAULT_PLATFORM_SETTINGS);
});

afterAll(async () => {
  await closeAdminClients();
});

describe("admin-updatePlatformSettings", () => {
  it("changes only the editable fields and audits what changed", async () => {
    const requestId = req();
    await updatePlatformSettings(deps, ADMIN, { requestId, ...settings, defaultCommissionPercent: 12.5, offerTimeoutMinutes: 5, supportPhone: "0302 123 456" });
    const s = platformSettingsDoc.parse((await db.doc(paths.platformSettings()).get()).data());
    expect(s).toMatchObject({ defaultCommissionPercent: 12.5, offerTimeoutMinutes: 5, supportPhone: "+233302123456", currency: "GHS", matchWeights: DEFAULT_PLATFORM_SETTINGS.matchWeights });
    expect((await adminActionRef(db, ADMIN, requestId).get()).data()).toMatchObject({
      actionType: "SETTINGS_UPDATED",
      before: { defaultCommissionPercent: 15, offerTimeoutMinutes: 10, supportPhone: null },
      after: { defaultCommissionPercent: 12.5, offerTimeoutMinutes: 5, supportPhone: "+233302123456" },
    });
  });

  it("is idempotent per request and refuses a no-op change", async () => {
    const requestId = req();
    await updatePlatformSettings(deps, ADMIN, { requestId, ...settings, matchRadiusKm: 20 });
    await expect(updatePlatformSettings(deps, ADMIN, { requestId, ...settings, matchRadiusKm: 20 })).resolves.toMatchObject({ ok: true });
    expect((await failure(updatePlatformSettings(deps, ADMIN, { requestId: req(), ...settings, matchRadiusKm: 20 }))).message).toMatch(/Nothing changed/);
  });
});

describe("commission rules", () => {
  it("creates scoped rules against real targets and audits them; rules are switched off, not edited", async () => {
    await db.doc(paths.service("plumbing")).set({ name: "Plumbing", isActive: true });
    const requestId = req();
    const { id } = await createCommissionRule(deps, ADMIN, { requestId, scope: "SERVICE", serviceId: "plumbing", percent: 10 });
    expect((await db.doc(paths.commissionRule(id)).get()).data()).toMatchObject({ scope: "SERVICE", serviceId: "plumbing", technicianId: null, percent: 10, isActive: true });
    // A retry returns the same rule.
    expect((await createCommissionRule(deps, ADMIN, { requestId, scope: "SERVICE", serviceId: "plumbing", percent: 10 })).id).toBe(id);
    expect((await db.collection("commissionRules").get()).size).toBe(1);

    await setCommissionRuleActive(deps, ADMIN, { requestId: req(), ruleId: id, isActive: false });
    expect((await db.doc(paths.commissionRule(id)).get()).get("isActive")).toBe(false);
    expect((await failure(setCommissionRuleActive(deps, ADMIN, { requestId: req(), ruleId: id, isActive: false }))).message).toMatch(/already inactive/);
    expect((await adminActionRef(db, ADMIN, requestId).get()).get("actionType")).toBe("COMMISSION_RULE_CREATED");
  });

  it("refuses rules for services or technicians that don't exist", async () => {
    expect((await failure(createCommissionRule(deps, ADMIN, { requestId: req(), scope: "SERVICE", serviceId: "nope", percent: 10 }))).code).toBe("NOT_FOUND");
    expect((await failure(createCommissionRule(deps, ADMIN, { requestId: req(), scope: "TECHNICIAN", technicianId: "nobody", percent: 10 }))).code).toBe("NOT_FOUND");
  });
});

describe("service areas", () => {
  const area = { name: "Spintex", city: "Accra", region: "Greater Accra", center: { lat: 5.63, lng: -0.12 }, defaultRadiusKm: 8 };

  it("creates with a slug id, edits audited fields, and hides instead of deleting", async () => {
    const { id } = await upsertServiceArea(deps, ADMIN, { requestId: req(), ...area });
    expect(id).toBe("spintex");
    expect(serviceAreaDoc.parse((await db.doc(paths.serviceArea(id)).get()).data())).toMatchObject({ ...area, country: "GH", isActive: true });

    const editId = req();
    await upsertServiceArea(deps, ADMIN, { requestId: editId, areaId: id, ...area, defaultRadiusKm: 10 });
    expect((await adminActionRef(db, ADMIN, editId).get()).data()).toMatchObject({ actionType: "SERVICE_AREA_UPDATED", before: { defaultRadiusKm: 8 }, after: { defaultRadiusKm: 10 } });

    await setServiceAreaActive(deps, ADMIN, { requestId: req(), areaId: id, isActive: false });
    expect((await db.doc(paths.serviceArea(id)).get()).get("isActive")).toBe(false);
  });

  it("refuses duplicate names and editing unknown areas", async () => {
    await upsertServiceArea(deps, ADMIN, { requestId: req(), ...area });
    expect((await failure(upsertServiceArea(deps, ADMIN, { requestId: req(), ...area }))).message).toMatch(/already an area called "Spintex"/);
    expect((await failure(upsertServiceArea(deps, ADMIN, { requestId: req(), areaId: "ghost", ...area, name: "Ghost Town" }))).code).toBe("NOT_FOUND");
  });
});
