import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { type Firestore, Timestamp, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** Technician profiles and verification records (Stage 6). */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-serviceflow",
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});
afterAll(async () => env?.cleanup());

const fixed = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));

function technician(status: string, overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Kwame Owusu",
    photoPath: null,
    bio: "",
    yearsExperience: 5,
    serviceIds: ["plumbing"],
    serviceAreas: [{ areaId: "osu", name: "Osu", lat: 5.55, lng: -0.17, radiusKm: 8 }],
    weeklyAvailability: [{ day: 1, start: "08:00", end: "17:00" }],
    isOnline: false,
    verificationStatus: status,
    latestVerificationId: null,
    stats: { ratingSum: 0, ratingCount: 0, avgRating: 0, completed: 0, cancelled: 0, offered: 0, responded: 0 },
    activeBookingId: null,
    createdAt: fixed,
    updatedAt: fixed,
    ...overrides,
  };
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, status] of [["verified", "ACTIVE"], ["pending", "ACTIVE"], ["banned", "SUSPENDED"], ["cust", "ACTIVE"]] as const) {
      await setDoc(doc(db, `users/${uid}`), { status });
    }
    await setDoc(doc(db, "technicians/verified"), technician("VERIFIED"));
    await setDoc(doc(db, "technicians/pending"), technician("PENDING"));
    await setDoc(doc(db, "technicians/banned"), technician("VERIFIED"));
    await setDoc(doc(db, "technicianVerifications/pending_s1"), { technicianId: "pending", idNumber: "GHA-123456789-0", status: "PENDING" });
  });
});

const as = (uid: string, claims: Record<string, unknown> = { tech: true }): Firestore =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const now = () => ({ updatedAt: serverTimestamp() });

describe("technician profiles", () => {
  it("any signed-in user can read a profile; visitors cannot", async () => {
    await assertSucceeds(getDoc(doc(as("cust", {}), "technicians/verified")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "technicians/verified")));
  });

  it("the technician can edit bio, experience and their own profile photo path", async () => {
    await assertSucceeds(
      updateDoc(doc(as("pending"), "technicians/pending"), {
        bio: "Plumber in Osu for 5 years",
        yearsExperience: 6,
        photoPath: "technicians/pending/profile/me.jpg",
        ...now(),
      }),
    );
  });

  it("a VERIFIED technician can go online; anyone can go offline", async () => {
    await assertSucceeds(updateDoc(doc(as("verified"), "technicians/verified"), { isOnline: true, ...now() }));
    await assertSucceeds(updateDoc(doc(as("verified"), "technicians/verified"), { isOnline: false, ...now() }));
  });

  it("an unverified technician cannot go online", async () => {
    await assertFails(updateDoc(doc(as("pending"), "technicians/pending"), { isOnline: true, ...now() }));
  });

  it("a technician cannot verify themselves, change stats, services or areas directly", async () => {
    const db = as("pending");
    await assertFails(updateDoc(doc(db, "technicians/pending"), { verificationStatus: "VERIFIED", ...now() }));
    await assertFails(updateDoc(doc(db, "technicians/pending"), { "stats.avgRating": 5, ...now() }));
    await assertFails(updateDoc(doc(db, "technicians/pending"), { serviceIds: ["electrical"], ...now() }));
    await assertFails(updateDoc(doc(db, "technicians/pending"), { serviceAreas: [], ...now() }));
  });

  it("rejects a photo path outside their folder, bad values and stale timestamps", async () => {
    const db = as("pending");
    await assertFails(updateDoc(doc(db, "technicians/pending"), { photoPath: "technicians/verified/profile/me.jpg", ...now() }));
    await assertFails(updateDoc(doc(db, "technicians/pending"), { bio: "x".repeat(501), ...now() }));
    await assertFails(updateDoc(doc(db, "technicians/pending"), { yearsExperience: 99, ...now() }));
    await assertFails(updateDoc(doc(db, "technicians/pending"), { bio: "Hello", updatedAt: fixed }));
  });

  it("nobody else edits a profile, suspended accounts can't edit theirs, and clients never create one", async () => {
    await assertFails(updateDoc(doc(as("pending"), "technicians/verified"), { bio: "hacked", ...now() }));
    await assertFails(updateDoc(doc(as("admin", { admin: true }), "technicians/verified"), { isOnline: false, ...now() }));
    await assertFails(updateDoc(doc(as("banned"), "technicians/banned"), { isOnline: true, ...now() }));
    await assertFails(setDoc(doc(as("cust"), "technicians/cust"), technician("VERIFIED")));
  });

  it("the tech capability is required, even on your own profile", async () => {
    await assertFails(updateDoc(doc(as("pending", {}), "technicians/pending"), { bio: "Hello", ...now() }));
  });
});

describe("verification records", () => {
  it("are readable by the technician and admins only", async () => {
    await assertSucceeds(getDoc(doc(as("pending"), "technicianVerifications/pending_s1")));
    await assertSucceeds(getDoc(doc(as("admin", { admin: true }), "technicianVerifications/pending_s1")));
    await assertFails(getDoc(doc(as("verified"), "technicianVerifications/pending_s1")));
    await assertFails(getDoc(doc(as("cust", {}), "technicianVerifications/pending_s1")));
  });

  it("are never written by clients — not even to approve themselves", async () => {
    await assertFails(updateDoc(doc(as("pending"), "technicianVerifications/pending_s1"), { status: "VERIFIED" }));
    await assertFails(setDoc(doc(as("pending"), "technicianVerifications/pending_s2"), { technicianId: "pending", status: "VERIFIED" }));
    await assertFails(updateDoc(doc(as("admin", { admin: true }), "technicianVerifications/pending_s1"), { status: "VERIFIED" }));
  });
});
