import { describe, expect, it } from "vitest";
import { firstName, isValidGhanaPostGps, normalizeGhanaPostGps, normalizePersonName } from "./profile";
import { addressInput, customerProfileInput } from "./schemas/callables";
import { customerAddressDoc, customerDoc } from "./schemas/documents";

describe("normalizePersonName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizePersonName("  Ama   Serwaa  ")).toBe("Ama Serwaa");
  });

  it("accepts Ghanaian letters, hyphens, apostrophes and dots", () => {
    expect(normalizePersonName("Kwabena Ɔwusu-Ansah")).toBe("Kwabena Ɔwusu-Ansah");
    expect(normalizePersonName("Abena O'Neill")).toBe("Abena O'Neill");
    expect(normalizePersonName("Dr. Efua Mensah")).toBe("Dr. Efua Mensah");
  });

  it("rejects too-short, too-long, numeric or symbol-led names", () => {
    expect(normalizePersonName("A")).toBeNull();
    expect(normalizePersonName("x".repeat(81))).toBeNull();
    expect(normalizePersonName("Agent 007")).toBeNull();
    expect(normalizePersonName("-Ama")).toBeNull();
    expect(normalizePersonName("<script>")).toBeNull();
  });
});

describe("firstName", () => {
  it("returns the first word for greetings", () => {
    expect(firstName("Ama Serwaa Boateng")).toBe("Ama");
    expect(firstName("  ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});

describe("GhanaPost GPS", () => {
  it("normalizes common ways people type digital addresses", () => {
    expect(normalizeGhanaPostGps("GA-543-0125")).toBe("GA-543-0125");
    expect(normalizeGhanaPostGps("ga5430125")).toBe("GA-543-0125");
    expect(normalizeGhanaPostGps("GA 543 0125")).toBe("GA-543-0125");
    expect(normalizeGhanaPostGps("gt-1234-5678")).toBe("GT-1234-5678");
  });

  it("rejects malformed addresses", () => {
    expect(isValidGhanaPostGps("G-543-0125")).toBe(false);
    expect(isValidGhanaPostGps("GA-54-0125")).toBe(false);
    expect(isValidGhanaPostGps("GA-543-012")).toBe(false);
    expect(isValidGhanaPostGps("East Legon")).toBe(false);
  });
});

describe("customerProfileInput", () => {
  it("normalizes a valid name and rejects invalid ones", () => {
    expect(customerProfileInput.parse({ fullName: "  Ama  Serwaa " })).toEqual({ fullName: "Ama Serwaa" });
    expect(customerProfileInput.safeParse({ fullName: "1" }).success).toBe(false);
  });
});

describe("addressInput", () => {
  const base = { label: "Home", directions: "Opposite the Shell station, blue gate", areaId: "east-legon" };

  it("accepts an address without a digital address and nulls empty optionals", () => {
    expect(addressInput.parse({ ...base, ghanaPostGps: "  ", notes: "" })).toEqual({
      ...base,
      ghanaPostGps: null,
      notes: null,
    });
  });

  it("normalizes a GhanaPost GPS address", () => {
    expect(addressInput.parse({ ...base, ghanaPostGps: "ga5430125" }).ghanaPostGps).toBe("GA-543-0125");
  });

  it("rejects a malformed digital address with a helpful message", () => {
    const result = addressInput.safeParse({ ...base, ghanaPostGps: "GA-12" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/GA-543-0125/);
  });

  it("requires directions a technician can follow", () => {
    expect(addressInput.safeParse({ ...base, directions: "here" }).success).toBe(false);
  });
});

describe("profile documents", () => {
  const ts = { toMillis: () => 0 };

  it("customerDoc and customerAddressDoc accept well-formed data", () => {
    expect(customerDoc.safeParse({ fullName: "Ama Serwaa", defaultAddressId: null, createdAt: ts, updatedAt: ts }).success).toBe(true);
    expect(
      customerAddressDoc.safeParse({
        label: "Home",
        directions: "Opposite the Shell station",
        ghanaPostGps: "GA-543-0125",
        areaId: "east-legon",
        areaName: "East Legon",
        location: { lat: 5.6494, lng: -0.1531 },
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      }).success,
    ).toBe(true);
  });

  it("customerAddressDoc rejects an un-normalized digital address", () => {
    const bad = customerAddressDoc.safeParse({
      label: "Home",
      directions: "Opposite the Shell station",
      ghanaPostGps: "ga5430125",
      areaId: "east-legon",
      areaName: "East Legon",
      location: { lat: 5.6, lng: -0.15 },
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    });
    expect(bad.success).toBe(false);
  });
});
