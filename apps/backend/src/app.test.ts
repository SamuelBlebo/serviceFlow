import { describe, expect, it } from "vitest";
import request from "supertest";
import { Role } from "@serviceflow/database";
import { createApp } from "./app";
import { signAccessToken } from "./modules/auth/jwt";

const app = createApp();

describe("GET /health", () => {
  it("responds 200 without requiring auth or a database call", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("input validation", () => {
  it("rejects an OTP request for a non-Ghanaian phone number before touching the database", async () => {
    const res = await request(app).post("/api/v1/auth/otp/request").send({ phone: "+14155552671", role: "CUSTOMER" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("unauthorized access is rejected before it reaches business logic", () => {
  it("blocks a booking lookup with no Authorization header", async () => {
    const res = await request(app).get("/api/v1/bookings/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("blocks the admin technician list with no Authorization header", async () => {
    const res = await request(app).get("/api/v1/technicians/admin");
    expect(res.status).toBe(401);
  });

  it("blocks a garbage bearer token", async () => {
    const res = await request(app)
      .get("/api/v1/bookings/00000000-0000-0000-0000-000000000000")
      .set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });
});

describe("role escalation is rejected server-side, regardless of the caller's claimed role", () => {
  it("a TECHNICIAN token cannot reach an ADMIN-only route", async () => {
    const token = signAccessToken({ sub: "tech-1", role: Role.TECHNICIAN });
    const res = await request(app).get("/api/v1/technicians/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("a CUSTOMER token cannot reach a TECHNICIAN-only route", async () => {
    const token = signAccessToken({ sub: "cust-1", role: Role.CUSTOMER });
    const res = await request(app).get("/api/v1/technicians/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("an unknown route returns 404, not a silent fallthrough", async () => {
    const res = await request(app).get("/api/v1/not-a-real-route");
    expect(res.status).toBe(404);
  });
});
