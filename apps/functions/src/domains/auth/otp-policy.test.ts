import { describe, expect, it } from "vitest";
import { decideRateLimit, ipRateLimitKey } from "../../lib/rate-limit";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "./otp-crypto";
import { type OtpChallengeState, attemptsRemaining, decideSend, decideVerify } from "./otp-policy";

const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);
const sec = (n: number) => n * 1000;

function challenge(overrides: Partial<OtpChallengeState> = {}): OtpChallengeState {
  return {
    expiresAtMs: T0 + sec(300),
    attempts: 0,
    lastSentAtMs: T0,
    windowStartMs: T0,
    sendsInWindow: 1,
    ...overrides,
  };
}

describe("decideSend", () => {
  it("allows the first code and opens a window", () => {
    expect(decideSend(null, T0)).toEqual({ allowed: true, windowStartMs: T0, sendsInWindow: 1 });
  });

  it("enforces the 30 s resend cooldown", () => {
    expect(decideSend(challenge(), T0 + sec(10))).toEqual({ allowed: false, reason: "cooldown", retryAfterSeconds: 20 });
    expect(decideSend(challenge(), T0 + sec(30))).toMatchObject({ allowed: true, sendsInWindow: 2 });
  });

  it("caps codes at 3 per 10-minute window", () => {
    const third = challenge({ sendsInWindow: 3, lastSentAtMs: T0 + sec(120) });
    expect(decideSend(third, T0 + sec(200))).toEqual({ allowed: false, reason: "window", retryAfterSeconds: 400 });
  });

  it("opens a fresh window once the old one has passed", () => {
    const third = challenge({ sendsInWindow: 3, lastSentAtMs: T0 + sec(120) });
    expect(decideSend(third, T0 + sec(600))).toEqual({ allowed: true, windowStartMs: T0 + sec(600), sendsInWindow: 1 });
  });
});

describe("decideVerify", () => {
  it("checks a live code", () => {
    expect(decideVerify(challenge(), T0 + sec(60))).toBe("check");
  });

  it("reports missing, expired and locked challenges", () => {
    expect(decideVerify(null, T0)).toBe("missing");
    expect(decideVerify(challenge(), T0 + sec(300))).toBe("expired");
    expect(decideVerify(challenge({ attempts: 5 }), T0 + sec(60))).toBe("locked");
  });

  it("locks before reporting expiry (no extra guesses on an old code)", () => {
    expect(decideVerify(challenge({ attempts: 5 }), T0 + sec(999))).toBe("locked");
  });

  it("counts remaining attempts", () => {
    expect(attemptsRemaining(0)).toBe(5);
    expect(attemptsRemaining(4)).toBe(1);
    expect(attemptsRemaining(9)).toBe(0);
  });
});

describe("OTP crypto", () => {
  it("generates zero-padded 6-digit codes", () => {
    for (let i = 0; i < 200; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it("verifies the right code and rejects others; hashes are salted", async () => {
    const a = await hashOtpCode("123456");
    const b = await hashOtpCode("123456");
    expect(a.hash).not.toBe(b.hash); // different salts
    expect(a.hash).not.toContain("123456");
    await expect(verifyOtpCode("123456", a.hash, a.salt)).resolves.toBe(true);
    await expect(verifyOtpCode("123457", a.hash, a.salt)).resolves.toBe(false);
  });
});

describe("decideRateLimit", () => {
  it("counts within a window and blocks at the limit", () => {
    let state = null;
    for (let i = 0; i < 3; i++) {
      const d = decideRateLimit(state, 3, 3600, T0);
      expect(d.allowed).toBe(true);
      if (d.allowed) state = d.next;
    }
    expect(decideRateLimit(state, 3, 3600, T0 + sec(60))).toEqual({ allowed: false, retryAfterSeconds: 3540 });
  });

  it("resets after the window", () => {
    expect(decideRateLimit({ windowStartMs: T0, count: 99 }, 3, 3600, T0 + sec(3600))).toMatchObject({ allowed: true });
  });

  it("hashes IPs into stable, non-reversible keys", () => {
    expect(ipRateLimitKey("otp", "41.66.1.2")).toBe(ipRateLimitKey("otp", "41.66.1.2"));
    expect(ipRateLimitKey("otp", "41.66.1.2")).not.toContain("41.66");
    expect(ipRateLimitKey("otp", "41.66.1.2")).not.toBe(ipRateLimitKey("otp", "41.66.1.3"));
  });
});
