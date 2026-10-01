import { callables } from "@serviceflow/firebase";
import { UserStatus } from "@serviceflow/shared";
import { type FirebaseApp, deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { FieldValue } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminClients, closeAdminClients, resetEmulators } from "../test/emulator";

/**
 * Calls the DEPLOYED callables through the Functions emulator, exactly as
 * the web and mobile apps do — covering adapter wiring, input validation,
 * guards, error mapping and the emulator-only dev code.
 */
const admin = adminClients();
const app: FirebaseApp = initializeApp({ apiKey: "demo-key", projectId: "demo-serviceflow" }, "callables-client");
connectAuthEmulator(getAuth(app), `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
connectFunctionsEmulator(getFunctions(app, "europe-west1"), "127.0.0.1", 5001);

beforeEach(async () => {
  await signOut(getAuth(app));
  await resetEmulators();
});

afterAll(async () => {
  await deleteApp(app);
  await closeAdminClients();
});

const fn = <I, O>(name: string) => httpsCallable<I, O>(getFunctions(app, "europe-west1"), name);
const requestOtp = fn<{ phone: string }, { devCode?: string; phone: string }>(callables.requestOtp.name);
const verifyOtp = fn<{ phone: string; code: string }, { token: string; isNewUser: boolean }>(callables.verifyOtp.name);
const suspendUser = fn<{ requestId: string; uid: string; reason: string }, { ok: true }>(callables.suspendUser.name);

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error("expected failure");
    },
    (e: { code: string; message: string; details?: unknown }) => e,
  );
}

async function signInAsAdmin() {
  await admin.auth.createUser({ uid: "admin-1", email: "admin@serviceflow.dev", password: "correct-horse-battery" });
  await admin.auth.setCustomUserClaims("admin-1", { admin: true });
  await admin.db.doc("users/admin-1").set({ status: UserStatus.ACTIVE, capabilities: { tech: false, admin: true }, createdAt: FieldValue.serverTimestamp() });
  await signInWithCustomToken(getAuth(app), await admin.auth.createCustomToken("admin-1", { admin: true }));
}

describe("auth-requestOtp / auth-verifyOtp over HTTP", () => {
  it("signs in end to end with the emulator dev code", async () => {
    const { data } = await requestOtp({ phone: "024 555 0101" });
    expect(data.phone).toBe("+233245550101");
    expect(data.devCode).toMatch(/^\d{6}$/); // emulator + mock sender only

    const verified = await verifyOtp({ phone: data.phone, code: data.devCode ?? "" });
    expect(verified.data.isNewUser).toBe(true);
    const cred = await signInWithCustomToken(getAuth(app), verified.data.token);
    expect(cred.user.phoneNumber).toBe("+233245550101");
  });

  it("rejects an invalid phone number before any work is done", async () => {
    const err = await failure(requestOtp({ phone: "+14155552671" }));
    expect(err.code).toBe("functions/invalid-argument");
  });

  it("returns a clear error for a wrong code", async () => {
    const { data } = await requestOtp({ phone: "0245550102" });
    const wrong = data.devCode === "000000" ? "111111" : "000000";
    const err = await failure(verifyOtp({ phone: data.phone, code: wrong }));
    expect(err.code).toBe("functions/invalid-argument");
    expect(err.message).toMatch(/Incorrect code/);
  });
});

describe("admin-suspendUser over HTTP", () => {
  beforeEach(async () => {
    await admin.auth.createUser({ uid: "cust-1", phoneNumber: "+233245550199" });
    await admin.db.doc("users/cust-1").set({ status: UserStatus.ACTIVE, capabilities: { tech: false, admin: false }, createdAt: FieldValue.serverTimestamp() });
  });

  const input = { requestId: "req_http_0001", uid: "cust-1", reason: "Fraud report" };

  it("requires sign-in", async () => {
    expect((await failure(suspendUser(input))).code).toBe("functions/unauthenticated");
  });

  it("rejects a signed-in non-admin (role escalation is server-side)", async () => {
    await signInWithCustomToken(getAuth(app), await admin.auth.createCustomToken("cust-1"));
    expect((await failure(suspendUser({ ...input, uid: "someone" }))).code).toBe("functions/permission-denied");
  });

  it("lets an active admin with a fresh sign-in suspend an account", async () => {
    await signInAsAdmin();
    const { data } = await suspendUser(input);
    expect(data).toEqual({ ok: true, id: "cust-1" });
    expect((await admin.db.doc("users/cust-1").get()).get("status")).toBe(UserStatus.SUSPENDED);
  });
});
