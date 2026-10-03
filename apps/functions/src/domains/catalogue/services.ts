import { COLLECTIONS, paths } from "@serviceflow/firebase";
import {
  ConflictError,
  NotFoundError,
  type SetServiceActiveInput,
  type UpsertServiceInput,
  ValidationError,
  serviceNameKey,
  slugify,
} from "@serviceflow/shared";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminActionData, adminActionRef } from "../../lib/audit";

/**
 * Service catalogue administration (plan §4.3 / §19 stage 4). Every change is
 * transactional, audited in `adminActions`, and idempotent per (admin, requestId).
 *
 * - The id is the slug, fixed at creation (bookings and technicians reference it).
 * - Names are unique regardless of case/spacing (`nameKey`).
 * - Services are never deleted — only hidden — so history stays intact.
 */
export interface CatalogueDeps {
  db: Firestore;
}

type ParsedUpsert = Omit<UpsertServiceInput, "name"> & { name: string };

const EDITABLE = ["name", "description", "priceRange", "sortOrder"] as const;

export async function upsertService(deps: CatalogueDeps, actorUid: string, input: ParsedUpsert): Promise<{ ok: true; id: string }> {
  const { db } = deps;
  const creating = input.serviceId === undefined;
  const serviceId = input.serviceId ?? slugify(input.name);
  if (!serviceId) throw new ValidationError("Use letters or numbers in the service name");

  const serviceRef = db.doc(paths.service(serviceId));
  const actionRef = adminActionRef(db, actorUid, input.requestId);
  const nameKey = serviceNameKey(input.name);
  const sameName = db.collection(COLLECTIONS.services).where("nameKey", "==", nameKey).limit(2);

  await db.runTransaction(async (tx) => {
    const [action, existing, clashes] = await Promise.all([tx.get(actionRef), tx.get(serviceRef), tx.get(sameName)]);
    if (action.exists) return; // retry of a request that already succeeded

    // Name clash first: it's the reason an admin understands ("already called…").
    if (clashes.docs.some((d) => d.id !== serviceId || creating)) {
      throw new ConflictError(`Another service is already called "${input.name}".`);
    }
    if (creating && existing.exists) {
      throw new ConflictError(`A service with the web address "${serviceId}" already exists. Choose a different name.`);
    }
    if (!creating && !existing.exists) throw new NotFoundError("Service", serviceId);

    const fields = {
      name: input.name,
      description: input.description,
      priceRange: input.priceRange,
      sortOrder: input.sortOrder,
      nameKey,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (creating) {
      tx.create(serviceRef, { ...fields, slug: serviceId, iconPath: null, isActive: true, createdAt: FieldValue.serverTimestamp() });
    } else {
      tx.update(serviceRef, fields);
    }

    const before = existing.exists ? existing.data() : null;
    const changed = before ? EDITABLE.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(input[k])) : [...EDITABLE];
    tx.create(
      actionRef,
      adminActionData({
        adminUid: actorUid,
        actionType: creating ? "SERVICE_CREATED" : "SERVICE_UPDATED",
        targetType: "service",
        targetId: serviceId,
        before: before ? Object.fromEntries(changed.map((k) => [k, before[k] ?? null])) : null,
        after: Object.fromEntries(changed.map((k) => [k, input[k]])),
        requestId: input.requestId,
      }),
    );
  });

  return { ok: true, id: serviceId };
}

export async function setServiceActive(
  deps: CatalogueDeps,
  actorUid: string,
  input: SetServiceActiveInput,
): Promise<{ ok: true; id: string }> {
  const { db } = deps;
  const serviceRef = db.doc(paths.service(input.serviceId));
  const actionRef = adminActionRef(db, actorUid, input.requestId);

  await db.runTransaction(async (tx) => {
    const [action, service] = await Promise.all([tx.get(actionRef), tx.get(serviceRef)]);
    if (action.exists) return;
    if (!service.exists) throw new NotFoundError("Service", input.serviceId);
    if (service.get("isActive") === input.isActive) {
      throw new ConflictError(input.isActive ? "This service is already visible." : "This service is already hidden.");
    }

    tx.update(serviceRef, { isActive: input.isActive, updatedAt: FieldValue.serverTimestamp() });
    tx.create(
      actionRef,
      adminActionData({
        adminUid: actorUid,
        actionType: input.isActive ? "SERVICE_ACTIVATED" : "SERVICE_DEACTIVATED",
        targetType: "service",
        targetId: input.serviceId,
        before: { isActive: !input.isActive },
        after: { isActive: input.isActive },
        reason: input.reason || null,
        requestId: input.requestId,
      }),
    );
  });

  return { ok: true, id: input.serviceId };
}
