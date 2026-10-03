import { describe, expect, it } from "vitest";
import { serviceNameKey, slugify } from "./catalogue";
import { setServiceActiveInput, upsertServiceInput } from "./schemas/callables";

describe("slugify", () => {
  it("makes URL-friendly ids from service names", () => {
    expect(slugify("Plumbing")).toBe("plumbing");
    expect(slugify("AC Repair & Maintenance")).toBe("ac-repair-and-maintenance");
    expect(slugify("  Home   Cleaning!! ")).toBe("home-cleaning");
    expect(slugify("Électricité")).toBe("electricite");
  });

  it("returns an empty slug when there is nothing usable", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"word ".repeat(30)}end`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("serviceNameKey", () => {
  it("ignores case and extra spaces", () => {
    expect(serviceNameKey("  Home   Cleaning ")).toBe(serviceNameKey("home cleaning"));
  });
});

describe("upsertServiceInput", () => {
  const base = {
    requestId: "req_12345678",
    name: "  Home   Cleaning ",
    description: "Regular and deep cleaning for homes and offices.",
    priceRange: { minMinor: 15000, maxMinor: 60000 },
    sortOrder: 4,
  };

  it("normalizes the name and accepts a valid service", () => {
    const parsed = upsertServiceInput.parse(base);
    expect(parsed.name).toBe("Home Cleaning");
    expect(parsed.serviceId).toBeUndefined();
  });

  it("rejects an inverted price range with a clear message", () => {
    const result = upsertServiceInput.safeParse({ ...base, priceRange: { minMinor: 60000, maxMinor: 15000 } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/lowest price/);
  });

  it("rejects fractional pesewas, absurd prices and names with nothing to slug", () => {
    expect(upsertServiceInput.safeParse({ ...base, priceRange: { minMinor: 100.5, maxMinor: 200 } }).success).toBe(false);
    expect(upsertServiceInput.safeParse({ ...base, priceRange: { minMinor: 0, maxMinor: 10_000_001 } }).success).toBe(false);
    expect(upsertServiceInput.safeParse({ ...base, name: "!!!" }).success).toBe(false);
  });

  it("allows editing an existing service by id", () => {
    expect(upsertServiceInput.safeParse({ ...base, serviceId: "plumbing" }).success).toBe(true);
  });
});

describe("setServiceActiveInput", () => {
  it("needs a service id and an explicit state", () => {
    expect(setServiceActiveInput.safeParse({ requestId: "req_12345678", serviceId: "plumbing", isActive: false }).success).toBe(true);
    expect(setServiceActiveInput.safeParse({ requestId: "req_12345678", serviceId: "plumbing" }).success).toBe(false);
  });
});
