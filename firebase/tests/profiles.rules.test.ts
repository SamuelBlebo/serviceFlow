import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  type Firestore,
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** Customer profiles and saved addresses (Stage 4): client-written, rules-validated. */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-serviceflow",
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});
afterAll(async () => env?.cleanup());

const fixed = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, status] of [["alice", "ACTIVE"], ["bob", "ACTIVE"], ["sam", "SUSPENDED"]] as const) {
      await setDoc(doc(db, `users/${uid}`), { displayName: "", status, capabilities: { tech: false, admin: false } });
    }
    await setDoc(doc(db, "serviceAreas/east-legon"), { name: "East Legon", isActive: true });
    await setDoc(doc(db, "serviceAreas/osu"), { name: "Osu", isActive: true });
    await setDoc(doc(db, "serviceAreas/closed"), { name: "Closed Area", isActive: false });
    await setDoc(doc(db, "customers/bob"), { fullName: "Bob Mensah", defaultAddressId: "home", createdAt: fixed, updatedAt: fixed });
    await setDoc(doc(db, "customers/bob/addresses/home"), { ...addressData(), createdAt: fixed, updatedAt: fixed });
    await setDoc(doc(db, "customers/bob/addresses/work"), { ...addressData({ label: "Work", areaId: "osu", areaName: "Osu" }), createdAt: fixed, updatedAt: fixed });
  });
});

function addressData(overrides: Record<string, unknown> = {}) {
  return {
    label: "Home",
    directions: "Opposite the Shell station, blue gate",
    ghanaPostGps: "GA-543-0125",
    areaId: "east-legon",
    areaName: "East Legon",
    location: { lat: 5.6494, lng: -0.1531 },
    notes: null,
    ...overrides,
  };
}

const stamps = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
// The rules-testing context exposes the compat type; it is the same instance the modular API accepts.
const as = (uid: string, claims: Record<string, unknown> = {}): Firestore =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

/** The onboarding batch the web app performs: profile + first address + account display name. */
function onboardingBatch(db: Firestore, uid: string, opts: { name?: string; address?: Record<string, unknown> | null } = {}) {
  const batch = writeBatch(db);
  const withAddress = opts.address !== null;
  batch.set(doc(db, `customers/${uid}`), {
    fullName: opts.name ?? "Alice Owusu",
    defaultAddressId: withAddress ? "home" : null,
    ...stamps(),
  });
  if (withAddress) batch.set(doc(db, `customers/${uid}/addresses/home`), { ...addressData(opts.address ?? {}), ...stamps() });
  batch.update(doc(db, `users/${uid}`), { displayName: opts.name ?? "Alice Owusu" });
  return batch.commit();
}

describe("creating a profile", () => {
  it("the owner can create their profile with a first address in one batch", async () => {
    await assertSucceeds(onboardingBatch(as("alice"), "alice"));
  });

  it("the owner can create a profile without an address", async () => {
    await assertSucceeds(onboardingBatch(as("alice"), "alice", { address: null }));
  });

  it("rejects an invalid name", async () => {
    for (const name of ["A", "Agent 007", " Alice", "Alice  Owusu", "x".repeat(81)]) {
      await assertFails(onboardingBatch(as("alice"), "alice", { name, address: null }));
    }
  });

  it("accepts names in Ghanaian scripts with hyphens and apostrophes", async () => {
    await assertSucceeds(onboardingBatch(as("alice"), "alice", { name: "Kwabena Ɔwusu-Ansah", address: null }));
  });

  it("rejects extra fields, client-chosen timestamps and a default pointing nowhere", async () => {
    const db = as("alice");
    await assertFails(setDoc(doc(db, "customers/alice"), { fullName: "Alice Owusu", defaultAddressId: null, ...stamps(), isVip: true }));
    await assertFails(setDoc(doc(db, "customers/alice"), { fullName: "Alice Owusu", defaultAddressId: null, createdAt: fixed, updatedAt: fixed }));
    await assertFails(setDoc(doc(db, "customers/alice"), { fullName: "Alice Owusu", defaultAddressId: "ghost", ...stamps() }));
  });

  it("a suspended account cannot create a profile", async () => {
    await assertFails(onboardingBatch(as("sam"), "sam", { address: null }));
  });

  it("nobody can create a profile for someone else", async () => {
    await assertFails(setDoc(doc(as("bob"), "customers/alice"), { fullName: "Alice Owusu", defaultAddressId: null, ...stamps() }));
    await assertFails(setDoc(doc(as("admin1", { admin: true }), "customers/alice"), { fullName: "Alice Owusu", defaultAddressId: null, ...stamps() }));
  });
});

describe("reading and updating profiles", () => {
  it("the owner and admins can read; other users cannot", async () => {
    await assertSucceeds(getDoc(doc(as("bob"), "customers/bob")));
    await assertSucceeds(getDoc(doc(as("bob"), "customers/bob/addresses/home")));
    await assertSucceeds(getDoc(doc(as("admin1", { admin: true }), "customers/bob/addresses/home")));
    await assertFails(getDoc(doc(as("alice"), "customers/bob")));
    await assertFails(getDoc(doc(as("alice"), "customers/bob/addresses/home")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "customers/bob")));
  });

  it("the owner can rename and switch the default to one of their addresses", async () => {
    await assertSucceeds(updateDoc(doc(as("bob"), "customers/bob"), { fullName: "Bob K. Mensah", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("bob"), "customers/bob"), { defaultAddressId: "work", updatedAt: serverTimestamp() }));
  });

  it("rejects a default address that does not exist, a stale updatedAt and createdAt rewrites", async () => {
    const db = as("bob");
    await assertFails(updateDoc(doc(db, "customers/bob"), { defaultAddressId: "ghost", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "customers/bob"), { fullName: "Bob Mensah Jr", updatedAt: fixed }));
    await assertFails(updateDoc(doc(db, "customers/bob"), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it("profiles are never deleted from a client, and admins cannot edit them", async () => {
    await assertFails(deleteDoc(doc(as("bob"), "customers/bob")));
    await assertFails(updateDoc(doc(as("admin1", { admin: true }), "customers/bob"), { fullName: "Changed", updatedAt: serverTimestamp() }));
  });
});

describe("saved addresses", () => {
  const add = (db: Firestore, id: string, overrides: Record<string, unknown> = {}) =>
    setDoc(doc(db, `customers/bob/addresses/${id}`), { ...addressData(overrides), ...stamps() });

  it("the owner can add a valid address, with or without a digital address", async () => {
    await assertSucceeds(add(as("bob"), "shop", { label: "Shop" }));
    await assertSucceeds(add(as("bob"), "family", { label: "Family house", ghanaPostGps: null, notes: "Call when you reach the junction" }));
  });

  it("rejects malformed digital addresses, short directions and long labels", async () => {
    const db = as("bob");
    await assertFails(add(db, "x1", { ghanaPostGps: "ga5430125" }));
    await assertFails(add(db, "x2", { directions: "here" }));
    await assertFails(add(db, "x3", { label: "x".repeat(41) }));
    await assertFails(add(db, "x4", { notes: "x".repeat(301) }));
  });

  it("requires an active catalogue area and refuses a spoofed area name", async () => {
    const db = as("bob");
    await assertFails(add(db, "x5", { areaId: "closed", areaName: "Closed Area" }));
    await assertFails(add(db, "x6", { areaId: "nowhere", areaName: "Nowhere" }));
    await assertFails(add(db, "x7", { areaId: "osu", areaName: "East Legon" }));
  });

  it("rejects unexpected fields and malformed locations", async () => {
    const db = as("bob");
    await assertFails(add(db, "x8", { verified: true }));
    await assertFails(add(db, "x9", { location: { lat: 999, lng: 0 } }));
    await assertFails(add(db, "x10", { location: { lat: 5.6, lng: -0.15, accuracy: 3 } }));
  });

  it("needs a profile first, and only the owner can add", async () => {
    await assertFails(setDoc(doc(as("alice"), "customers/alice/addresses/home"), { ...addressData(), ...stamps() }));
    await assertFails(setDoc(doc(as("alice"), "customers/bob/addresses/sneaky"), { ...addressData(), ...stamps() }));
  });

  it("updates keep createdAt and stamp updatedAt", async () => {
    const db = as("bob");
    await assertSucceeds(setDoc(doc(db, "customers/bob/addresses/work"), { ...addressData({ label: "Office", areaId: "osu", areaName: "Osu" }), createdAt: fixed, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "customers/bob/addresses/work"), { ...addressData(), ...stamps() }));
  });

  it("the default address can't be deleted unless the same batch moves the default", async () => {
    const db = as("bob");
    await assertFails(deleteDoc(doc(db, "customers/bob/addresses/home")));
    const batch = writeBatch(db);
    batch.update(doc(db, "customers/bob"), { defaultAddressId: "work", updatedAt: serverTimestamp() });
    batch.delete(doc(db, "customers/bob/addresses/home"));
    await assertSucceeds(batch.commit());
  });

  it("a non-default address can be deleted by its owner only", async () => {
    await assertFails(deleteDoc(doc(as("alice"), "customers/bob/addresses/work")));
    await assertSucceeds(deleteDoc(doc(as("bob"), "customers/bob/addresses/work")));
  });
});
