import { createHash } from "node:crypto";
import { COLLECTIONS, paths } from "@serviceflow/firebase";
import {
  CommissionScope,
  ConflictError,
  DEFAULT_PLATFORM_SETTINGS,
  NotFoundError,
  ValidationError,
  normalizeGhanaPhone,
  platformSettingsDoc,
  slugify,
} from "@serviceflow/shared";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminActionData, adminActionRef } from "../../lib/audit";

/*
 * Platform configuration (Stage 10): settings, commission rules and service
 * areas. Every change is one transaction with its audit entry
 * (`adminActions/{admin}_{requestId}`), so a retried request is a no-op.
 * Commission rules are never edited (deactivate + create keeps a clean
 * history); areas and services are hidden, never deleted.
 */

export interface SettingsDeps {
  db: Firestore;
}
type Done = Promise<{ ok: true; id: string }>;

const SETTINGS_FIELDS = ["defaultCommissionPercent", "offerTimeoutMinutes", "matchingExpiryMinutes", "matchRadiusKm", "supportPhone"] as const;

export async function updatePlatformSettings(
  deps: SettingsDeps,
  adminUid: string,
  input: {
    requestId: string;
    defaultCommissionPercent: number;
    offerTimeoutMinutes: number;
    matchingExpiryMinutes: number;
    matchRadiusKm: number;
    supportPhone?: string;
  },
): Done {
  const { db } = deps;
  const ref = db.doc(paths.platformSettings());
  const actionRef = adminActionRef(db, adminUid, input.requestId);
  const next = {
    defaultCommissionPercent: input.defaultCommissionPercent,
    offerTimeoutMinutes: input.offerTimeoutMinutes,
    matchingExpiryMinutes: input.matchingExpiryMinutes,
    matchRadiusKm: input.matchRadiusKm,
    supportPhone: input.supportPhone ? (normalizeGhanaPhone(input.supportPhone) ?? null) : null,
  };

  await db.runTransaction(async (tx) => {
    const [action, snap] = await Promise.all([tx.get(actionRef), tx.get(ref)]);
    if (action.exists) return;
    const current = snap.exists ? platformSettingsDoc.parse(snap.data()) : DEFAULT_PLATFORM_SETTINGS;
    const changed = SETTINGS_FIELDS.filter((k) => current[k] !== next[k]);
    if (changed.length === 0) throw new ConflictError("Nothing changed.");
    // Fields admins don't edit here (currency, weights, payout minimum…) are kept.
    tx.set(ref, { ...current, ...next });
    tx.create(
      actionRef,
      adminActionData({
        adminUid,
        actionType: "SETTINGS_UPDATED",
        targetType: "settings",
        targetId: "platform",
        before: Object.fromEntries(changed.map((k) => [k, current[k] ?? null])),
        after: Object.fromEntries(changed.map((k) => [k, next[k]])),
        requestId: input.requestId,
      }),
    );
  });
  return { ok: true, id: "platform" };
}

export async function createCommissionRule(
  deps: SettingsDeps,
  adminUid: string,
  input: { requestId: string; scope: CommissionScope; serviceId?: string; technicianId?: string; percent: number },
): Done {
  const { db } = deps;
  // Deterministic id per request: a retry finds the rule it already made.
  const ruleId = `rule_${createHash("sha256").update(`${adminUid}:${input.requestId}`).digest("hex").slice(0, 16)}`;
  const ruleRef = db.doc(paths.commissionRule(ruleId));
  const actionRef = adminActionRef(db, adminUid, input.requestId);
  const serviceId = input.scope === CommissionScope.SERVICE ? input.serviceId! : null;
  const technicianId = input.scope === CommissionScope.TECHNICIAN ? input.technicianId! : null;

  await db.runTransaction(async (tx) => {
    const [action, target] = await Promise.all([
      tx.get(actionRef),
      serviceId ? tx.get(db.doc(paths.service(serviceId))) : technicianId ? tx.get(db.doc(paths.technician(technicianId))) : Promise.resolve(null),
    ]);
    if (action.exists) return;
    if (target && !target.exists) throw new NotFoundError(serviceId ? "Service" : "Technician", serviceId ?? technicianId ?? undefined);
    tx.create(ruleRef, { scope: input.scope, serviceId, technicianId, percent: input.percent, isActive: true, createdAt: FieldValue.serverTimestamp() });
    tx.create(
      actionRef,
      adminActionData({
        adminUid,
        actionType: "COMMISSION_RULE_CREATED",
        targetType: "commissionRule",
        targetId: ruleId,
        after: { scope: input.scope, serviceId, technicianId, percent: input.percent },
        requestId: input.requestId,
      }),
    );
  });
  return { ok: true, id: ruleId };
}

export async function setCommissionRuleActive(deps: SettingsDeps, adminUid: string, input: { requestId: string; ruleId: string; isActive: boolean }): Done {
  const { db } = deps;
  const ref = db.doc(paths.commissionRule(input.ruleId));
  const actionRef = adminActionRef(db, adminUid, input.requestId);
  await db.runTransaction(async (tx) => {
    const [action, rule] = await Promise.all([tx.get(actionRef), tx.get(ref)]);
    if (action.exists) return;
    if (!rule.exists) throw new NotFoundError("Commission rule", input.ruleId);
    if (rule.get("isActive") === input.isActive) throw new ConflictError(input.isActive ? "This rule is already active." : "This rule is already inactive.");
    tx.update(ref, { isActive: input.isActive });
    tx.create(
      actionRef,
      adminActionData({
        adminUid,
        actionType: input.isActive ? "COMMISSION_RULE_ACTIVATED" : "COMMISSION_RULE_DEACTIVATED",
        targetType: "commissionRule",
        targetId: input.ruleId,
        before: { isActive: !input.isActive, percent: rule.get("percent") },
        after: { isActive: input.isActive },
        requestId: input.requestId,
      }),
    );
  });
  return { ok: true, id: input.ruleId };
}

const AREA_FIELDS = ["name", "city", "region", "center", "defaultRadiusKm"] as const;

export async function upsertServiceArea(
  deps: SettingsDeps,
  adminUid: string,
  input: { requestId: string; areaId?: string; name: string; city: string; region: string; center: { lat: number; lng: number }; defaultRadiusKm: number },
): Done {
  const { db } = deps;
  const creating = input.areaId === undefined;
  const areaId = input.areaId ?? slugify(input.name);
  if (!areaId) throw new ValidationError("Use letters or numbers in the area name");
  const ref = db.doc(paths.serviceArea(areaId));
  const actionRef = adminActionRef(db, adminUid, input.requestId);
  const fields = { name: input.name, city: input.city, region: input.region, center: input.center, defaultRadiusKm: input.defaultRadiusKm };

  await db.runTransaction(async (tx) => {
    const [action, existing, sameName] = await Promise.all([
      tx.get(actionRef),
      tx.get(ref),
      tx.get(db.collection(COLLECTIONS.serviceAreas).where("name", "==", input.name).limit(2)),
    ]);
    if (action.exists) return;
    if (sameName.docs.some((d) => d.id !== areaId || creating)) throw new ConflictError(`There is already an area called "${input.name}".`);
    if (creating && existing.exists) throw new ConflictError(`An area with the id "${areaId}" already exists. Choose a different name.`);
    if (!creating && !existing.exists) throw new NotFoundError("Service area", areaId);
    if (creating) tx.create(ref, { ...fields, country: "GH", isActive: true });
    else tx.update(ref, fields);
    const before = existing.exists ? existing.data()! : null;
    const changed = before ? AREA_FIELDS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(fields[k])) : [...AREA_FIELDS];
    tx.create(
      actionRef,
      adminActionData({
        adminUid,
        actionType: creating ? "SERVICE_AREA_CREATED" : "SERVICE_AREA_UPDATED",
        targetType: "serviceArea",
        targetId: areaId,
        before: before ? Object.fromEntries(changed.map((k) => [k, before[k] ?? null])) : null,
        after: Object.fromEntries(changed.map((k) => [k, fields[k]])),
        requestId: input.requestId,
      }),
    );
  });
  return { ok: true, id: areaId };
}

export async function setServiceAreaActive(deps: SettingsDeps, adminUid: string, input: { requestId: string; areaId: string; isActive: boolean }): Done {
  const { db } = deps;
  const ref = db.doc(paths.serviceArea(input.areaId));
  const actionRef = adminActionRef(db, adminUid, input.requestId);
  await db.runTransaction(async (tx) => {
    const [action, area] = await Promise.all([tx.get(actionRef), tx.get(ref)]);
    if (action.exists) return;
    if (!area.exists) throw new NotFoundError("Service area", input.areaId);
    if (area.get("isActive") === input.isActive) throw new ConflictError(input.isActive ? "This area is already active." : "This area is already hidden.");
    tx.update(ref, { isActive: input.isActive });
    tx.create(
      actionRef,
      adminActionData({
        adminUid,
        actionType: input.isActive ? "SERVICE_AREA_ACTIVATED" : "SERVICE_AREA_DEACTIVATED",
        targetType: "serviceArea",
        targetId: input.areaId,
        before: { isActive: !input.isActive },
        after: { isActive: input.isActive },
        requestId: input.requestId,
      }),
    );
  });
  return { ok: true, id: input.areaId };
}
