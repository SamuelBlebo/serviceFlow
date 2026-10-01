import { describe, expect, it } from "vitest";
import { OTP_POLICY, capabilitiesFromClaims } from "./auth";
import { requestOtpInput, setUserStatusInput, verifyOtpInput } from "./schemas/callables";

describe("capabilitiesFromClaims", () => {
  it("only a literal true grants a capability", () => {
    expect(capabilitiesFromClaims({ admin: true })).toEqual({ tech: false, admin: true });
    expect(capabilitiesFromClaims({ admin: "true", tech: 1 })).toEqual({ tech: false, admin: false });
    expect(capabilitiesFromClaims(null)).toEqual({ tech: false, admin: false });
  });
});

describe("OTP policy", () => {
  it("keeps the legacy rules: 6 digits, 5 minutes, 5 attempts", () => {
    expect(OTP_POLICY.codeLength).toBe(6);
    expect(OTP_POLICY.ttlSeconds).toBe(300);
    expect(OTP_POLICY.maxAttempts).toBe(5);
  });
});

describe("auth callable inputs", () => {
  it("requestOtp accepts local and international Ghana formats, rejects others", () => {
    expect(requestOtpInput.safeParse({ phone: "024 123 4567" }).success).toBe(true);
    expect(requestOtpInput.safeParse({ phone: "+233241234567" }).success).toBe(true);
    expect(requestOtpInput.safeParse({ phone: "+14155552671" }).success).toBe(false);
    expect(requestOtpInput.safeParse({}).success).toBe(false);
  });

  it("verifyOtp needs exactly six digits", () => {
    expect(verifyOtpInput.safeParse({ phone: "0241234567", code: "123456" }).success).toBe(true);
    expect(verifyOtpInput.safeParse({ phone: "0241234567", code: "12345" }).success).toBe(false);
    expect(verifyOtpInput.safeParse({ phone: "0241234567", code: "12345a" }).success).toBe(false);
  });

  it("status changes need a request id and a real reason", () => {
    expect(setUserStatusInput.safeParse({ requestId: "req_12345678", uid: "u1", reason: "Fraud report" }).success).toBe(true);
    expect(setUserStatusInput.safeParse({ requestId: "req_12345678", uid: "u1", reason: "x" }).success).toBe(false);
  });
});
