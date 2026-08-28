import { describe, expect, it } from "vitest";
import { parseCustomTime, serviceMenuText, timeMenuText } from "./conversation-handlers";

describe("parseCustomTime", () => {
  it("parses a well-formed DD/MM HH:mm string", () => {
    const result = parseCustomTime("25/08 14:00");
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(25);
    expect(result!.getMonth()).toBe(7); // 0-indexed: August
    expect(result!.getHours()).toBe(14);
    expect(result!.getMinutes()).toBe(0);
  });

  it("returns null for a malformed string", () => {
    expect(parseCustomTime("not a date")).toBeNull();
    expect(parseCustomTime("25-08 14:00")).toBeNull();
    expect(parseCustomTime("25/08")).toBeNull();
  });

  it("rolls a past date forward one year rather than accepting a time in the past", () => {
    const pastMonthDay = "01/01 00:01"; // Jan 1st is almost certainly in the past relative to "now" in testing
    const result = parseCustomTime(pastMonthDay);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
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
