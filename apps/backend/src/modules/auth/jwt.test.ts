import { describe, expect, it } from "vitest";
import { Role } from "@home-service/database";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "./jwt";

describe("access tokens", () => {
  it("round-trips userId and role", () => {
    const token = signAccessToken({ sub: "user-1", role: Role.TECHNICIAN });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.role).toBe(Role.TECHNICIAN);
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ sub: "user-1", role: Role.CUSTOMER });
    const tampered = token.slice(0, -2) + (token.slice(-2) === "aa" ? "bb" : "aa");
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe("refresh tokens", () => {
  it("round-trips userId and is NOT a valid access token", () => {
    const token = signRefreshToken({ sub: "user-2" });
    expect(verifyRefreshToken(token).sub).toBe("user-2");
    // A refresh token is signed with a different secret — it must not verify as an access token.
    expect(() => verifyAccessToken(token)).toThrow();
  });
});
