import { paths } from "@serviceflow/firebase";
import { AppError, UserStatus } from "@serviceflow/shared";
import { initializeApp as initClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth as getClientAuth, signInWithCustomToken } from "firebase/auth";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MockOtpSender } from "../../integrations/otp/mock-otp-sender";
import { adminClients, closeAdminClients, resetEmulators, testClock } from "../../test/emulator";
import { setUserStatus } from "../admin/user-status";
import { type OtpDeps, requestOtp, verifyOtp } from "./otp-service";

const PHONE = "+233241234567";
const IP = "41.66.10.20";

const { auth, db } = adminClients();
let sender: MockOtpSender;
let clock: ReturnType<typeof testClock>;
let deps: OtpDeps;

beforeEach(async () => {
  await resetEmulators();
  sender = new MockOtpSender();
  clock = testClock();
  deps = { db, auth, sender, now: clock.now };
});

afterAll(closeAdminClients);

const lastCode = () => sender.sent.at(-1)?.code ?? "";

async function expectAppError(promise: Promise<unknown>, code: string, message?: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (message) expect((err as AppError).message).toMatch(message);
  return err as AppError;
}

describe("phone sign-in happy path", () => {
  it("sends a code, verifies it, creates the account and returns a working custom token", async () => {
    const requested = await requestOtp(deps, { phone: "024 123 4567", ip: IP });
    expect(requested).toMatchObject({ ok: true, phone: PHONE, expiresInSeconds: 300, resendInSeconds: 30 });
    expect(requested.devCode).toBeUndefined(); // never exposed unless explicitly enabled
    expect(sender.sent).toHaveLength(1);

    const verified = await verifyOtp(deps, { phone: PHONE, code: lastCode() });
    expect(verified.isNewUser).toBe(true);

    const authUser = await auth.getUserByPhoneNumber(PHONE);
    const userDoc = (await db.doc(paths.user(authUser.uid)).get()).data();
    expect(userDoc).toMatchObject({ phone: PHONE, status: UserStatus.ACTIVE, capabilities: { tech: false, admin: false } });

    // The token really signs a client in, as the right user.
    const clientApp = initClientApp({ apiKey: "demo-key", projectId: "demo-serviceflow" }, `client-${Date.now()}`);
    const clientAuth = getClientAuth(clientApp);
    connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const credential = await signInWithCustomToken(clientAuth, verified.token);
    expect(credential.user.uid).toBe(authUser.uid);
    expect(credential.user.phoneNumber).toBe(PHONE);
  });

  it("signs a returning user into the same account", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    const first = await verifyOtp(deps, { phone: PHONE, code: lastCode() });
    clock.advanceSeconds(60);
    await requestOtp(deps, { phone: "0241234567", ip: IP });
    const second = await verifyOtp(deps, { phone: PHONE, code: lastCode() });
    expect(first.isNewUser).toBe(true);
    expect(second.isNewUser).toBe(false);
    const users = await auth.listUsers();
    expect(users.users).toHaveLength(1);
  });

  it("exposes the code to the client only when the emulator flag is set", async () => {
    const result = await requestOtp({ ...deps, exposeDevCode: true }, { phone: PHONE, ip: IP });
    expect(result.devCode).toBe(lastCode());
  });
});

describe("what a code request does NOT do", () => {
  it("doesn't create an account (no phone-number enumeration) and never stores the code in plain text", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    await expect(auth.getUserByPhoneNumber(PHONE)).rejects.toMatchObject({ code: "auth/user-not-found" });
    const challenge = (await db.doc(paths.otpChallenge(PHONE)).get()).data();
    expect(JSON.stringify(challenge)).not.toContain(lastCode());
    expect(challenge).toHaveProperty("codeHash");
  });
});

describe("wrong, expired and reused codes", () => {
  it("counts wrong guesses and locks after five, even for the right code", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";

    await expectAppError(verifyOtp(deps, { phone: PHONE, code: wrong }), "VALIDATION_ERROR", /4 attempts left/);
    for (let i = 0; i < 4; i++) await verifyOtp(deps, { phone: PHONE, code: wrong }).catch(() => undefined);
    expect((await db.doc(paths.otpChallenge(PHONE)).get()).get("attempts")).toBe(5);

    await expectAppError(verifyOtp(deps, { phone: PHONE, code: right }), "UNAUTHORIZED", /Too many incorrect attempts/);
  });

  it("rejects an expired code and clears it", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    clock.advanceSeconds(301);
    await expectAppError(verifyOtp(deps, { phone: PHONE, code: lastCode() }), "VALIDATION_ERROR", /expired/);
    expect((await db.doc(paths.otpChallenge(PHONE)).get()).exists).toBe(false);
  });

  it("is single-use", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    const code = lastCode();
    await verifyOtp(deps, { phone: PHONE, code });
    await expectAppError(verifyOtp(deps, { phone: PHONE, code }), "VALIDATION_ERROR", /No active code/);
  });

  it("a new code replaces the previous one", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    const old = lastCode();
    clock.advanceSeconds(31);
    await requestOtp(deps, { phone: PHONE, ip: IP });
    if (old !== lastCode()) {
      await expectAppError(verifyOtp(deps, { phone: PHONE, code: old }), "VALIDATION_ERROR", /Incorrect code/);
    }
    await expect(verifyOtp(deps, { phone: PHONE, code: lastCode() })).resolves.toHaveProperty("token");
  });
});

describe("abuse limits", () => {
  it("enforces the 30-second resend cooldown", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    clock.advanceSeconds(10);
    await expectAppError(requestOtp(deps, { phone: PHONE, ip: IP }), "RATE_LIMITED", /wait 20 seconds/);
    clock.advanceSeconds(20);
    await expect(requestOtp(deps, { phone: PHONE, ip: IP })).resolves.toMatchObject({ ok: true });
  });

  it("allows at most 3 codes per phone per 10 minutes", async () => {
    for (let i = 0; i < 3; i++) {
      await requestOtp(deps, { phone: PHONE, ip: IP });
      clock.advanceSeconds(31);
    }
    await expectAppError(requestOtp(deps, { phone: PHONE, ip: IP }), "RATE_LIMITED");
    expect(sender.sent).toHaveLength(3);
  });

  it("limits requests per network, across different phone numbers", async () => {
    for (let i = 0; i < 20; i++) {
      await requestOtp(deps, { phone: `+23324${String(1000000 + i)}`, ip: IP });
    }
    await expectAppError(requestOtp(deps, { phone: "+233209999999", ip: IP }), "RATE_LIMITED", /this network/);
    // A different network is unaffected.
    await expect(requestOtp(deps, { phone: "+233209999999", ip: "102.176.1.1" })).resolves.toMatchObject({ ok: true });
  });
});

describe("suspended accounts", () => {
  it("cannot sign in, even with a correct code", async () => {
    await requestOtp(deps, { phone: PHONE, ip: IP });
    await verifyOtp(deps, { phone: PHONE, code: lastCode() });
    const { uid } = await auth.getUserByPhoneNumber(PHONE);
    await setUserStatus({ db, auth }, "admin-1", { requestId: "req_suspend_1", uid, reason: "Fraud report" }, UserStatus.SUSPENDED);

    clock.advanceSeconds(60);
    await requestOtp(deps, { phone: PHONE, ip: IP });
    await expectAppError(verifyOtp(deps, { phone: PHONE, code: lastCode() }), "FORBIDDEN", /suspended/);
  });
});
