import { describe, expect, it } from "vitest";
import { PreferredTime } from "./enums";
import { resolveNeededAt, zonedDayAndTime, zonedWallTimeToDate } from "./time";

describe("zonedDayAndTime", () => {
  it("reads Accra wall-clock time regardless of the host time zone", () => {
    // 2026-09-29 (Tuesday) 23:30 UTC is 23:30 in Accra (UTC+0)...
    const instant = new Date(Date.UTC(2026, 8, 29, 23, 30));
    expect(zonedDayAndTime(instant, "Africa/Accra")).toEqual({ dayOfWeek: 2, time: "23:30" });
    // ...but already Wednesday 00:30 in Lagos (UTC+1) — proves the zone is honoured.
    expect(zonedDayAndTime(instant, "Africa/Lagos")).toEqual({ dayOfWeek: 3, time: "00:30" });
  });
});

describe("zonedWallTimeToDate", () => {
  it("round-trips a wall-clock time through the zone", () => {
    const wall = { year: 2026, month: 8, day: 25, hour: 14, minute: 0 };
    expect(zonedWallTimeToDate(wall, "Africa/Accra").toISOString()).toBe("2026-08-25T14:00:00.000Z");
    expect(zonedWallTimeToDate(wall, "Africa/Lagos").toISOString()).toBe("2026-08-25T13:00:00.000Z");
  });
});

describe("resolveNeededAt", () => {
  const now = new Date(Date.UTC(2026, 8, 30, 10, 15)); // Wednesday 10:15 Accra

  it("uses now for ASAP / TODAY / TOMORROW (as the legacy code did)", () => {
    expect(resolveNeededAt(PreferredTime.ASAP, null, now)).toEqual({ dayOfWeek: 3, time: "10:15" });
  });

  it("uses scheduledAt for SCHEDULED bookings", () => {
    const scheduled = new Date(Date.UTC(2026, 9, 3, 16, 0)); // Saturday 16:00
    expect(resolveNeededAt(PreferredTime.SCHEDULED, scheduled, now)).toEqual({ dayOfWeek: 6, time: "16:00" });
  });
});
