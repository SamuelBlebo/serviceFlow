import { paths } from "@serviceflow/firebase";
import { AppError, UserStatus } from "@serviceflow/shared";
import { FieldValue } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminActionRef } from "../../lib/audit";
import { requireActiveUser } from "../../lib/guards";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { setUserStatus } from "./user-status";

const { auth, db } = adminClients();
const ADMIN = "admin-1";

async function createAccount(uid: string, opts: { technician?: boolean } = {}) {
  await auth.createUser({ uid });
  await db.doc(paths.user(uid)).set({
    phone: null,
    email: null,
    displayName: uid,
    status: UserStatus.ACTIVE,
    capabilities: { tech: Boolean(opts.technician), admin: false },
    suspension: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (opts.technician) await db.doc(paths.technician(uid)).set({ displayName: uid, isOnline: true });
}

beforeEach(resetEmulators);
afterAll(closeAdminClients);

const suspend = (uid: string, requestId = "req_suspend_1") =>
  setUserStatus({ db, auth }, ADMIN, { requestId, uid, reason: "Repeated no-shows" }, UserStatus.SUSPENDED);
const reactivate = (uid: string, requestId = "req_reactivate_1") =>
  setUserStatus({ db, auth }, ADMIN, { requestId, uid, reason: "Appeal accepted" }, UserStatus.ACTIVE);

describe("suspendUser", () => {
  it("suspends the account, disables sign-in, revokes sessions and takes a technician offline", async () => {
    await createAccount("tech-1", { technician: true });
    const before = await auth.getUser("tech-1");

    await suspend("tech-1");

    const user = (await db.doc(paths.user("tech-1")).get()).data();
    expect(user?.status).toBe(UserStatus.SUSPENDED);
    expect(user?.suspension).toMatchObject({ reason: "Repeated no-shows", byUid: ADMIN });

    const after = await auth.getUser("tech-1");
    expect(after.disabled).toBe(true);
    expect(new Date(after.tokensValidAfterTime ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(before.tokensValidAfterTime ?? 0).getTime(),
    );

    expect((await db.doc(paths.technician("tech-1")).get()).get("isOnline")).toBe(false);
  });

  it("writes an immutable audit entry with before/after and reason", async () => {
    await createAccount("cust-1");
    await suspend("cust-1");
    const entry = (await adminActionRef(db, ADMIN, "req_suspend_1").get()).data();
    expect(entry).toMatchObject({
      adminUid: ADMIN,
      actionType: "USER_SUSPENDED",
      targetType: "user",
      targetId: "cust-1",
      before: { status: "ACTIVE" },
      after: { status: "SUSPENDED" },
      reason: "Repeated no-shows",
    });
  });

  it("is idempotent for a retried request, but rejects a duplicate suspension", async () => {
    await createAccount("cust-1");
    await suspend("cust-1");
    await expect(suspend("cust-1")).resolves.toEqual({ ok: true, id: "cust-1" }); // same requestId: retry
    await expect(suspend("cust-1", "req_suspend_2")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("makes the per-call active-account guard reject the user immediately", async () => {
    await createAccount("cust-1");
    const request = { auth: { uid: "cust-1", token: {} } };
    await expect(requireActiveUser(request, db)).resolves.toMatchObject({ uid: "cust-1" });
    await suspend("cust-1");
    await expect(requireActiveUser(request, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses self-suspension and unknown accounts", async () => {
    const self = await setUserStatus({ db, auth }, ADMIN, { requestId: "req_x_1234", uid: ADMIN, reason: "oops" }, UserStatus.SUSPENDED).catch((e: AppError) => e);
    expect((self as AppError).code).toBe("FORBIDDEN");
    await expect(suspend("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reactivateUser", () => {
  it("restores access and records the reactivation", async () => {
    await createAccount("cust-1");
    await suspend("cust-1");
    await reactivate("cust-1");

    expect((await db.doc(paths.user("cust-1")).get()).data()).toMatchObject({ status: "ACTIVE", suspension: null });
    expect((await auth.getUser("cust-1")).disabled).toBe(false);
    expect((await adminActionRef(db, ADMIN, "req_reactivate_1").get()).get("actionType")).toBe("USER_REACTIVATED");
  });
});
