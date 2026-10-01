import { describe, expect, it } from "vitest";
import { parseCustomTime, selectionFrom, serviceMenuText, timeMenuText } from "./text";

// Ported from the legacy conversation-handlers.test.ts. The only change is an
// explicit time zone and a fixed "now", so results no longer depend on the
// machine running the tests.
const NOW = new Date(Date.UTC(2026, 8, 30, 12, 0)); // 30 Sep 2026, 12:00 Accra
const ACCRA = { now: NOW, timeZone: "Africa/Accra" };

describe("parseCustomTime", () => {
  it("parses a well-formed DD/MM HH:mm string", () => {
    const result = parseCustomTime("25/12 14:00", ACCRA);
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-12-25T14:00:00.000Z");
  });

  it("returns null for a malformed string", () => {
    expect(parseCustomTime("not a date", ACCRA)).toBeNull();
    expect(parseCustomTime("25-08 14:00", ACCRA)).toBeNull();
    expect(parseCustomTime("25/08", ACCRA)).toBeNull();
  });

  it("rolls a past date forward one year rather than accepting a time in the past", () => {
    const result = parseCustomTime("01/01 00:01", ACCRA);
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2027-01-01T00:01:00.000Z");
    expect(result!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  // New coverage
  it("interprets the time in the platform time zone, not the host's", () => {
    const lagos = parseCustomTime("25/12 14:00", { now: NOW, timeZone: "Africa/Lagos" });
    expect(lagos!.toISOString()).toBe("2026-12-25T13:00:00.000Z");
  });

  it("rejects impossible calendar dates and times", () => {
    expect(parseCustomTime("31/02 10:00", ACCRA)).toBeNull();
    expect(parseCustomTime("10/13 10:00", ACCRA)).toBeNull();
    expect(parseCustomTime("10/10 24:00", ACCRA)).toBeNull();
  });
});

describe("serviceMenuText", () => {
  it("renders a numbered menu from the DB-driven service list", () => {
    const text = serviceMenuText([
      { index: 1, serviceId: "s1", name: "Plumbing" },
      { index: 2, serviceId: "s2", name: "Electrical" },
    ]);
    expect(text).toContain("1️⃣ Plumbing");
    expect(text).toContain("2️⃣ Electrical");
  });

  it("greets the customer as ServiceFlow", () => {
    expect(serviceMenuText([])).toContain("Welcome to ServiceFlow");
  });
});

describe("timeMenuText", () => {
  it("presents the four preferred-time options", () => {
    const text = timeMenuText();
    expect(text).toContain("ASAP");
    expect(text).toContain("Today");
    expect(text).toContain("Tomorrow");
    expect(text).toContain("Choose a time");
  });
});

describe("selectionFrom", () => {
  it("prefers the interactive reply id, else trimmed text", () => {
    expect(selectionFrom({ interactiveId: "2", text: "ignored" })).toBe("2");
    expect(selectionFrom({ text: "  3 " })).toBe("3");
    expect(selectionFrom({})).toBeUndefined();
  });
});
