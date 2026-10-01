import { serviceDoc } from "@serviceflow/shared";
import { describe, expect, it } from "vitest";
import { callables } from "./callables";
import { COLLECTIONS, paths, storagePaths } from "./paths";
import { isTimestampLike, parseDoc, parseDocs, timestampToDate, timestampToDateOrNull } from "./timestamp";

describe("paths", () => {
  it("builds document and subcollection paths", () => {
    expect(paths.booking("b1")).toBe("bookings/b1");
    expect(paths.bookingStatusHistory("b1")).toBe("bookings/b1/statusHistory");
    expect(paths.bookingContact("b1")).toBe("bookings/b1/private/contact");
    expect(paths.walletTransaction("u1", "earning_b1")).toBe("wallets/u1/transactions/earning_b1");
    expect(paths.platformSettings()).toBe("settings/platform");
    expect(paths.paymentWebhookEvent("paystack", "evt9")).toBe("paymentWebhookEvents/paystack_evt9");
  });

  it("keys payments and ratings by booking id (one per booking)", () => {
    expect(paths.payment("b42")).toBe("payments/b42");
    expect(paths.rating("b42")).toBe("ratings/b42");
  });

  it("refuses ids that would escape their collection", () => {
    expect(() => paths.booking("a/b")).toThrow(/Invalid booking id/);
    expect(() => paths.user("")).toThrow();
    expect(() => storagePaths.verificationDocument("u1", "s1", "../x/y.jpg")).toThrow();
  });

  it("has unique collection names", () => {
    const names = Object.values(COLLECTIONS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("builds storage paths under the owner's prefix", () => {
    expect(storagePaths.verificationDocument("u1", "s1", "id.jpg")).toBe("verifications/u1/s1/id.jpg");
    expect(storagePaths.bookingMedia("b1", "AFTER", "p.jpg")).toBe("bookings/b1/AFTER/p.jpg");
  });
});

describe("timestamp helpers", () => {
  const ts = { toMillis: () => Date.UTC(2026, 8, 30) };

  it("recognises and converts timestamp-like values", () => {
    expect(isTimestampLike(ts)).toBe(true);
    expect(isTimestampLike(new Date())).toBe(false);
    expect(timestampToDate(ts).toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(timestampToDateOrNull(null)).toBeNull();
  });
});

describe("parseDoc / parseDocs", () => {
  const valid = {
    name: "Plumbing",
    slug: "plumbing",
    description: "",
    iconPath: null,
    priceRange: { minMinor: 10000, maxMinor: 40000 },
    isActive: true,
    sortOrder: 1,
  };
  const snap = (id: string, data: unknown) => ({ id, data: () => data });

  it("returns typed data with its id", () => {
    expect(parseDoc(serviceDoc, snap("plumbing", valid))).toEqual({ ...valid, id: "plumbing" });
  });

  it("returns null for a missing document", () => {
    expect(parseDoc(serviceDoc, snap("missing", undefined))).toBeNull();
  });

  it("throws when stored data breaks the contract", () => {
    expect(() => parseDoc(serviceDoc, snap("bad", { ...valid, priceRange: { minMinor: 1.5, maxMinor: 2 } }))).toThrow(
      /does not match/,
    );
  });

  it("skips and reports invalid documents in lists instead of failing the whole list", () => {
    const invalid: string[] = [];
    const docs = parseDocs(serviceDoc, [snap("a", valid), snap("b", { nope: true })], (id) => invalid.push(id));
    expect(docs.map((d) => d.id)).toEqual(["a"]);
    expect(invalid).toEqual(["b"]);
  });
});

describe("callable registry", () => {
  const defs = Object.values(callables);

  it("uses unique, deployable group-name identifiers", () => {
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+-[A-Za-z]+$/);
  });

  it("requires an idempotency requestId on every mutating callable", () => {
    for (const def of defs.filter((d) => d.stage !== "foundation")) {
      expect(def.input.safeParse({}).success, def.name).toBe(false);
    }
  });

  it("health takes no input", () => {
    expect(callables.health.input.safeParse({}).success).toBe(true);
    expect(callables.health.input.safeParse({ extra: 1 }).success).toBe(false);
  });
});
