import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { Role } from "@home-service/database";
import { AppError } from "@home-service/shared";
import { authenticate, requireRole } from "./auth";
import { signAccessToken } from "../../modules/auth/jwt";

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers, auth: undefined } as unknown as Request;
}

describe("authenticate", () => {
  it("attaches req.auth from a valid bearer token", () => {
    const token = signAccessToken({ sub: "user-1", role: Role.TECHNICIAN });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();

    authenticate(req, {} as never, next);

    expect(req.auth).toEqual({ userId: "user-1", role: Role.TECHNICIAN });
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws 401 when the Authorization header is missing", () => {
    const req = mockReq();
    expect(() => authenticate(req, {} as never, vi.fn())).toThrow(AppError);
    try {
      authenticate(req, {} as never, vi.fn());
    } catch (err) {
      expect((err as AppError).httpStatus).toBe(401);
    }
  });

  it("throws 401 for a malformed/invalid token", () => {
    const req = mockReq({ authorization: "Bearer not-a-real-token" });
    expect(() => authenticate(req, {} as never, vi.fn())).toThrow(AppError);
  });
});

describe("requireRole", () => {
  it("calls next() when the caller's role is allowed", () => {
    const req = mockReq();
    req.auth = { userId: "admin-1", role: Role.ADMIN };
    const next = vi.fn();

    requireRole(Role.ADMIN)(req, {} as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("throws 403 when the caller's role is not allowed — a technician cannot hit an admin-only route", () => {
    const req = mockReq();
    req.auth = { userId: "tech-1", role: Role.TECHNICIAN };

    let caught: unknown;
    try {
      requireRole(Role.ADMIN)(req, {} as never, vi.fn());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).httpStatus).toBe(403);
  });

  it("throws 401 if called before authenticate (no req.auth)", () => {
    const req = mockReq();
    expect(() => requireRole(Role.ADMIN)(req, {} as never, vi.fn())).toThrow(AppError);
  });
});
