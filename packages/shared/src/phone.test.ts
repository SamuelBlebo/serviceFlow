import { describe, expect, it } from "vitest";
import { formatGhanaPhoneForDisplay, isValidGhanaPhone, normalizeGhanaPhone } from "./phone";

describe("normalizeGhanaPhone", () => {
  it("normalizes a local 0-prefixed number", () => {
    expect(normalizeGhanaPhone("0241234567")).toBe("+233241234567");
  });

  it("normalizes a number with spaces", () => {
    expect(normalizeGhanaPhone("024 123 4567")).toBe("+233241234567");
  });

  it("normalizes an already-E.164 number", () => {
    expect(normalizeGhanaPhone("+233241234567")).toBe("+233241234567");
  });

  it("normalizes a 233-prefixed number without +", () => {
    expect(normalizeGhanaPhone("233241234567")).toBe("+233241234567");
  });

  it("normalizes a bare 9-digit national number", () => {
    expect(normalizeGhanaPhone("241234567")).toBe("+233241234567");
  });

  it("rejects a too-short number", () => {
    expect(normalizeGhanaPhone("024123")).toBeNull();
  });

  it("rejects a non-Ghana country code", () => {
    expect(normalizeGhanaPhone("+14155552671")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(normalizeGhanaPhone("not a phone number")).toBeNull();
  });
});

describe("isValidGhanaPhone", () => {
  it("accepts valid numbers", () => {
    expect(isValidGhanaPhone("0241234567")).toBe(true);
  });

  it("rejects invalid numbers", () => {
    expect(isValidGhanaPhone("123")).toBe(false);
  });
});

describe("formatGhanaPhoneForDisplay", () => {
  it("formats an E.164 number for display", () => {
    expect(formatGhanaPhoneForDisplay("+233241234567")).toBe("024 123 4567");
  });

  it("returns the input unchanged if it doesn't match the expected shape", () => {
    expect(formatGhanaPhoneForDisplay("not-e164")).toBe("not-e164");
  });
});
