import { AppError, createBookingInput } from "@serviceflow/shared";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { toHttpsError } from "./errors";
import { parseInput, requireAuth, requireCapability, requireRecentSignIn } from "./guards";

// Replaces the legacy `common/middleware/auth.test.ts` (JWT middleware) and
// the auth/role-escalation cases of `app.test.ts`: the same guarantees,
// expressed against Firebase callable requests.

const customer = { auth: { uid: "cust-1", token: {} } };
const technician = { auth: { uid: "tech-1", token: { tech: true } } };
const adminUser = { auth: { uid: "admin-1", token: { admin: true } } };

function httpsCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return toHttpsError(err).code;
  }
  return undefined;
}

describe("requireAuth", () => {
  it("returns the uid and capabilities from the verified token", () => {
    expect(requireAuth(technician)).toEqual({ uid: "tech-1", capabilities: { tech: true, admin: false } });
  });

  it("rejects an unauthenticated call as unauthenticated (legacy: 401)", () => {
    expect(httpsCode(() => requireAuth({}))).toBe("unauthenticated");
    expect(httpsCode(() => requireAuth({ auth: undefined }))).toBe("unauthenticated");
  });

  it("only treats a literal `true` claim as a capability", () => {
    const spoofy = { auth: { uid: "x", token: { admin: "true", tech: 1 } } };
    expect(requireAuth(spoofy).capabilities).toEqual({ tech: false, admin: false });
  });
});

describe("requireCapability — role escalation is rejected server-side", () => {
  it("allows a caller with the capability", () => {
    expect(requireCapability(adminUser, "admin").uid).toBe("admin-1");
    expect(requireCapability(technician, "tech").uid).toBe("tech-1");
  });

  it("a technician cannot reach an admin-only callable (legacy: 403)", () => {
    expect(httpsCode(() => requireCapability(technician, "admin"))).toBe("permission-denied");
  });

  it("a customer cannot reach a technician-only callable (legacy: 403)", () => {
    expect(httpsCode(() => requireCapability(customer, "tech"))).toBe("permission-denied");
  });

  it("checks authentication before capability", () => {
    expect(httpsCode(() => requireCapability({}, "admin"))).toBe("unauthenticated");
  });
});

describe("parseInput", () => {
  it("rejects a malformed payload before any business logic runs (legacy: 400)", () => {
    expect(httpsCode(() => parseInput(createBookingInput, { serviceId: "" }))).toBe("invalid-argument");
  });

  it("returns typed data for a valid payload", () => {
    const input = parseInput(createBookingInput, {
      requestId: "req_12345678",
      serviceId: "plumbing",
      problemDescription: "Leaking pipe",
      location: { lat: 5.6, lng: -0.18 },
      preferredTime: "ASAP",
    });
    expect(input.serviceId).toBe("plumbing");
  });
});

describe("toHttpsError", () => {
  it("keeps the message of domain errors", () => {
    const mapped = toHttpsError(new AppError("Booking is closed", { code: "INVALID_STATE_TRANSITION", httpStatus: 409 }));
    expect(mapped).toBeInstanceOf(HttpsError);
    expect(mapped.code).toBe("failed-precondition");
    expect(mapped.message).toBe("Booking is closed");
  });

  it("hides unexpected errors behind a generic internal error", () => {
    const mapped = toHttpsError(new Error("connection string postgres://secret"));
    expect(mapped.code).toBe("internal");
    expect(mapped.message).not.toContain("secret");
  });
});

describe("requireRecentSignIn", () => {
  const now = Date.UTC(2026, 9, 1, 12, 0, 0);
  const signedInAt = (secondsAgo: number) => ({ auth: { uid: "admin-1", token: { admin: true, auth_time: now / 1000 - secondsAgo } } });

  it("accepts a sign-in within 15 minutes", () => {
    expect(() => requireRecentSignIn(signedInAt(14 * 60), now)).not.toThrow();
  });

  it("asks for re-authentication after 15 minutes, with a code clients can detect", () => {
    const err = (() => {
      try {
        requireRecentSignIn(signedInAt(16 * 60), now);
      } catch (e) {
        return toHttpsError(e);
      }
    })();
    expect(err?.code).toBe("unauthenticated");
    expect((err?.details as { code?: string }).code).toBe("REAUTH_REQUIRED");
  });

  it("treats a token without auth_time as stale", () => {
    expect(() => requireRecentSignIn({ auth: { uid: "x", token: {} } }, now)).toThrow();
  });
});
