import { COLLECTIONS, paths } from "@serviceflow/firebase";
import { AppError, serviceDoc } from "@serviceflow/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminActionRef } from "../../lib/audit";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { setServiceActive, upsertService } from "./services";

const { db } = adminClients();
const ADMIN = "admin-1";
const deps = { db };
let n = 0;
const req = () => `req_catalogue_${++n}_${Date.now()}`;

const cleaning = () => ({
  requestId: req(),
  name: "Home Cleaning",
  description: "Regular and deep cleaning for homes and offices.",
  priceRange: { minMinor: 15000, maxMinor: 60000 },
  sortOrder: 4,
});

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  return err as AppError;
}

beforeEach(resetEmulators);
afterAll(closeAdminClients);

describe("creating a service", () => {
  it("creates it under its slug, visible, with a valid catalogue document", async () => {
    const result = await upsertService(deps, ADMIN, cleaning());
    expect(result).toEqual({ ok: true, id: "home-cleaning" });

    const snap = await db.doc(paths.service("home-cleaning")).get();
    expect(serviceDoc.safeParse(snap.data()).success).toBe(true);
    expect(snap.data()).toMatchObject({ slug: "home-cleaning", isActive: true, nameKey: "home cleaning", iconPath: null });
  });

  it("writes an audit entry and is idempotent for a retried request", async () => {
    const input = cleaning();
    await upsertService(deps, ADMIN, input);
    await expect(upsertService(deps, ADMIN, input)).resolves.toEqual({ ok: true, id: "home-cleaning" });

    const entry = (await adminActionRef(db, ADMIN, input.requestId).get()).data();
    expect(entry).toMatchObject({ actionType: "SERVICE_CREATED", targetType: "service", targetId: "home-cleaning", before: null });
    expect((await db.collection(COLLECTIONS.adminActions).get()).size).toBe(1);
  });

  it("refuses a duplicate name, whatever the capitalisation", async () => {
    await upsertService(deps, ADMIN, cleaning());
    const err = await failure(upsertService(deps, ADMIN, { ...cleaning(), name: "home   CLEANING" }));
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toMatch(/already called/); // the understandable reason, not the slug clash
  });

  it("refuses to reuse an existing web address", async () => {
    await upsertService(deps, ADMIN, cleaning());
    // A different name that produces the same slug.
    const err = await failure(upsertService(deps, ADMIN, { ...cleaning(), name: "Home-Cleaning!" }));
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toMatch(/web address/);
  });
});

describe("editing a service", () => {
  it("updates fields, keeps the slug and audits only what changed", async () => {
    await upsertService(deps, ADMIN, cleaning());
    const edit = { ...cleaning(), serviceId: "home-cleaning", name: "Home & Office Cleaning", priceRange: { minMinor: 20000, maxMinor: 80000 } };
    await upsertService(deps, ADMIN, edit);

    const snap = await db.doc(paths.service("home-cleaning")).get();
    expect(snap.data()).toMatchObject({ slug: "home-cleaning", name: "Home & Office Cleaning", priceRange: { minMinor: 20000, maxMinor: 80000 } });

    const entry = (await adminActionRef(db, ADMIN, edit.requestId).get()).data();
    expect(entry?.actionType).toBe("SERVICE_UPDATED");
    expect(Object.keys(entry?.after ?? {}).sort()).toEqual(["name", "priceRange"]);
    expect(entry?.before).toMatchObject({ name: "Home Cleaning", priceRange: { minMinor: 15000, maxMinor: 60000 } });
  });

  it("allows keeping the same name when editing, but not taking another service's name", async () => {
    await upsertService(deps, ADMIN, cleaning());
    await upsertService(deps, ADMIN, { ...cleaning(), name: "Carpentry" });
    await expect(upsertService(deps, ADMIN, { ...cleaning(), serviceId: "home-cleaning", sortOrder: 9 })).resolves.toMatchObject({ ok: true });
    const err = await failure(upsertService(deps, ADMIN, { ...cleaning(), serviceId: "home-cleaning", name: "carpentry" }));
    expect(err.code).toBe("CONFLICT");
  });

  it("rejects editing a service that doesn't exist", async () => {
    const err = await failure(upsertService(deps, ADMIN, { ...cleaning(), serviceId: "ghost" }));
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("hiding and showing", () => {
  it("hides a service with a reason, audited, and refuses a no-op", async () => {
    await upsertService(deps, ADMIN, cleaning());
    const hide = { requestId: req(), serviceId: "home-cleaning", isActive: false, reason: "No verified cleaners yet" };
    await setServiceActive(deps, ADMIN, hide);

    expect((await db.doc(paths.service("home-cleaning")).get()).get("isActive")).toBe(false);
    expect((await adminActionRef(db, ADMIN, hide.requestId).get()).data()).toMatchObject({
      actionType: "SERVICE_DEACTIVATED",
      reason: "No verified cleaners yet",
      before: { isActive: true },
      after: { isActive: false },
    });

    const again = await failure(setServiceActive(deps, ADMIN, { ...hide, requestId: req() }));
    expect(again.code).toBe("CONFLICT");
  });

  it("shows it again", async () => {
    await upsertService(deps, ADMIN, cleaning());
    await setServiceActive(deps, ADMIN, { requestId: req(), serviceId: "home-cleaning", isActive: false });
    await setServiceActive(deps, ADMIN, { requestId: req(), serviceId: "home-cleaning", isActive: true });
    expect((await db.doc(paths.service("home-cleaning")).get()).get("isActive")).toBe(true);
  });

  it("rejects an unknown service", async () => {
    const err = await failure(setServiceActive(deps, ADMIN, { requestId: req(), serviceId: "ghost", isActive: false }));
    expect(err.code).toBe("NOT_FOUND");
  });
});
