import { describe, expect, it } from "vitest";
import { healthHandler } from "./callables/health";
import { type StatusResponse, statusHandler } from "./http/status";

const NOW = new Date("2026-09-30T12:00:00.000Z");

describe("system-health callable", () => {
  it("reports ok without requiring sign-in", async () => {
    await expect(healthHandler({}, NOW)).resolves.toEqual({
      status: "ok",
      service: "serviceflow-functions",
      time: "2026-09-30T12:00:00.000Z",
    });
  });

  it("rejects unexpected input", async () => {
    await expect(healthHandler({ injected: true }, NOW)).rejects.toThrow("Invalid request");
  });
});

describe("system-status HTTP endpoint", () => {
  function recordingRes() {
    const recorded: { code?: number; headers: Record<string, string>; body?: unknown } = { headers: {} };
    const res: StatusResponse = {
      status(code) {
        recorded.code = code;
        return res;
      },
      set(field, value) {
        recorded.headers[field] = value;
        return res;
      },
      json(body) {
        recorded.body = body;
      },
    };
    return { res, recorded };
  }

  it("returns 200 for GET", () => {
    const { res, recorded } = recordingRes();
    statusHandler({ method: "GET" }, res, NOW);
    expect(recorded.code).toBe(200);
    expect(recorded.body).toEqual({ status: "ok", service: "serviceflow-functions", time: NOW.toISOString() });
  });

  it("returns 405 for anything else", () => {
    const { res, recorded } = recordingRes();
    statusHandler({ method: "POST" }, res, NOW);
    expect(recorded.code).toBe(405);
    expect(recorded.headers.Allow).toBe("GET");
  });
});
