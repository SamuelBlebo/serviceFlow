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

describe("admin-upsertService / admin-setServiceActive over HTTP", () => {
  const upsertService = fn<Record<string, unknown>, { ok: true; id: string }>(callables.upsertService.name);
  const setServiceActive = fn<Record<string, unknown>, { ok: true; id: string }>(callables.setServiceActive.name);
  const input = {
    requestId: "req_http_service_1",
    name: "Carpentry",
    description: "Doors, cabinets and furniture repairs.",
    priceRange: { minMinor: 12000, maxMinor: 50000 },
    sortOrder: 5,
  };

  it("rejects signed-out callers and non-admins", async () => {
    expect((await failure(upsertService(input))).code).toBe("functions/unauthenticated");
    await admin.auth.createUser({ uid: "cust-9" });
    await signInWithCustomToken(getAuth(app), await admin.auth.createCustomToken("cust-9"));
    expect((await failure(upsertService(input))).code).toBe("functions/permission-denied");
  });

  it("lets an admin create and hide a service, with validation errors mapped for the UI", async () => {
    await signInAsAdmin();
    const bad = await failure(upsertService({ ...input, priceRange: { minMinor: 50000, maxMinor: 12000 } }));
    expect(bad.code).toBe("functions/invalid-argument");

    await expect(upsertService(input)).resolves.toMatchObject({ data: { ok: true, id: "carpentry" } });
    await expect(setServiceActive({ requestId: "req_http_service_2", serviceId: "carpentry", isActive: false })).resolves.toMatchObject({
      data: { ok: true, id: "carpentry" },
    });
    expect((await admin.db.doc("services/carpentry").get()).get("isActive")).toBe(false);
  });
});

describe("optional fields sent as undefined by the client SDK (Stage 5 regression)", () => {
  it("creates a service when the page passes serviceId: undefined (the SDK sends null)", async () => {
    await signInAsAdmin();
    const upsert = fn<Record<string, unknown>, { ok: true; id: string }>(callables.upsertService.name);
    const result = await upsert({
      requestId: "req_http_service_undefined",
      serviceId: undefined,
      name: "Home Cleaning",
      description: "Regular and deep cleaning.",
      priceRange: { minMinor: 15000, maxMinor: 60000 },
      sortOrder: 4,
    });
    expect(result.data).toEqual({ ok: true, id: "home-cleaning" });
  });
});

describe("technician callables over HTTP", () => {
  const register = fn<Record<string, unknown>, { ok: true; id: string }>(callables.registerTechnician.name);
  const updateServices = fn<Record<string, unknown>, { ok: true; id: string }>(callables.updateTechnicianServices.name);
  const review = fn<Record<string, unknown>, { ok: true; id: string }>(callables.reviewTechnician.name);

  async function signInAsCustomer(uid: string) {
    await admin.auth.createUser({ uid });
    await admin.db.doc(`users/${uid}`).set({ status: UserStatus.ACTIVE, capabilities: { tech: false, admin: false }, displayName: "", createdAt: FieldValue.serverTimestamp() });
    await signInWithCustomToken(getAuth(app), await admin.auth.createCustomToken(uid));
  }

  it("registration grants the tech claim, visible after a token refresh", async () => {
    await signInAsCustomer("cust-tech-1");
    await expect(register({ requestId: "req_http_register_1", displayName: "Yaw Mensah", yearsExperience: 3 })).resolves.toMatchObject({
      data: { ok: true, id: "cust-tech-1" },
    });
    const token = await getAuth(app).currentUser?.getIdTokenResult(true);
    expect(token?.claims.tech).toBe(true);
  });

  it("only technicians can update services, and only admins can review", async () => {
    await signInAsCustomer("cust-tech-2");
    const services = { requestId: "req_http_services_1", serviceIds: ["plumbing"], areaIds: ["osu"], weeklyAvailability: [{ day: 1, start: "08:00", end: "17:00" }] };
    expect((await failure(updateServices(services))).code).toBe("functions/permission-denied");
    expect((await failure(review({ requestId: "req_http_review_1", technicianId: "x", decision: "APPROVE" }))).code).toBe(
      "functions/permission-denied",
    );
  });
});
