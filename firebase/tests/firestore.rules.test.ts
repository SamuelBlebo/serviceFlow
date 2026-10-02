import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "demo-serviceflow";
let env: RulesTestEnvironment;

const activeService = { name: "Plumbing", slug: "plumbing", isActive: true, sortOrder: 1 };
const inactiveService = { name: "Retired", slug: "retired", isActive: false, sortOrder: 9 };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "services/plumbing"), activeService);
    await setDoc(doc(db, "services/retired"), inactiveService);
    await setDoc(doc(db, "serviceAreas/east-legon"), { name: "East Legon", isActive: true });
    await setDoc(doc(db, "serviceAreas/closed-area"), { name: "Closed", isActive: false });
    await setDoc(doc(db, "settings/platform"), { currency: "GHS", timezone: "Africa/Accra" });
    await setDoc(doc(db, "settings/internal"), { note: "not exposed" });
    await setDoc(doc(db, "users/alice"), { displayName: "Alice", status: "ACTIVE", capabilities: { tech: false, admin: false } });
    await setDoc(doc(db, "users/bob"), { displayName: "Bob", status: "ACTIVE", capabilities: { tech: false, admin: false } });
    await setDoc(doc(db, "users/sam"), { displayName: "Sam", status: "SUSPENDED", capabilities: { tech: false, admin: false } });
    await setDoc(doc(db, "otpChallenges/+233241234567"), { codeHash: "x", salt: "y", attempts: 0 });
    await setDoc(doc(db, "rateLimits/otp_ip_abc"), { count: 1 });
    await setDoc(doc(db, "bookings/b1"), { customerId: "alice", status: "REQUESTED" });
    await setDoc(doc(db, "wallets/tech1"), { availableMinor: 5000 });
    await setDoc(doc(db, "adminActions/a1"), { actionType: "TECHNICIAN_VERIFIED" });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const customer = (uid = "alice") => env.authenticatedContext(uid).firestore();
const technician = (uid = "tech1") => env.authenticatedContext(uid, { tech: true }).firestore();
const admin = (uid = "admin1") => env.authenticatedContext(uid, { admin: true }).firestore();

describe("services catalogue", () => {
  it("anyone, even signed out, can read an active service", async () => {
    await assertSucceeds(getDoc(doc(anon(), "services/plumbing")));
  });

  it("nobody but an admin can read an inactive service", async () => {
    await assertFails(getDoc(doc(anon(), "services/retired")));
    await assertFails(getDoc(doc(customer(), "services/retired")));
    await assertSucceeds(getDoc(doc(admin(), "services/retired")));
  });

  it("allows listing when the query is constrained to active services", async () => {
    await assertSucceeds(getDocs(query(collection(anon(), "services"), where("isActive", "==", true))));
  });

  it("denies an unconstrained list that could expose inactive services", async () => {
    await assertFails(getDocs(collection(anon(), "services")));
  });

  it("no client — not even an admin — can write services directly (callables only)", async () => {
    for (const db of [anon(), customer(), technician(), admin()]) {
      await assertFails(setDoc(doc(db, "services/new"), { name: "Hack", isActive: true }));
      await assertFails(updateDoc(doc(db, "services/plumbing"), { isActive: false }));
      await assertFails(deleteDoc(doc(db, "services/plumbing")));
    }
  });
});

describe("service areas catalogue", () => {
  it("is publicly readable when active, admin-only otherwise, never client-writable", async () => {
    await assertSucceeds(getDoc(doc(anon(), "serviceAreas/east-legon")));
    await assertFails(getDoc(doc(anon(), "serviceAreas/closed-area")));
    await assertSucceeds(getDoc(doc(admin(), "serviceAreas/closed-area")));
    await assertFails(setDoc(doc(admin(), "serviceAreas/x"), { name: "X", isActive: true }));
  });
});

describe("settings", () => {
  it("platform settings are readable by signed-in users only", async () => {
    await assertFails(getDoc(doc(anon(), "settings/platform")));
    await assertSucceeds(getDoc(doc(customer(), "settings/platform")));
  });

  it("other settings documents are not exposed", async () => {
    await assertFails(getDoc(doc(customer(), "settings/internal")));
  });

  it("settings are never client-writable", async () => {
    await assertFails(setDoc(doc(admin(), "settings/platform"), { defaultCommissionPercent: 0 }));
  });
});

describe("deny by default", () => {
  it("a user cannot read another user's account document", async () => {
    await assertFails(getDoc(doc(customer("alice"), "users/bob")));
  });

  it("closed collections are unreadable and unwritable for every role", async () => {
    // Bookings opened for participants and admins in Stage 7 (bookings.rules.test.ts).
    for (const db of [anon(), customer(), technician(), admin()]) {
      await assertFails(getDoc(doc(db, "wallets/tech1")));
      await assertFails(getDoc(doc(db, "adminActions/a1")));
      await assertFails(getDoc(doc(db, "someUnknownCollection/x")));
    }
  });

  it("clients cannot create bookings, touch wallets or forge audit entries", async () => {
    await assertFails(setDoc(doc(customer(), "bookings/new"), { customerId: "alice", status: "PAID" }));
    await assertFails(updateDoc(doc(technician("tech1"), "wallets/tech1"), { availableMinor: 500000 }));
    await assertFails(setDoc(doc(admin(), "adminActions/forged"), { actionType: "X" }));
  });

});

describe("users (Stage 3)", () => {
  it("a user can read their own account, an admin can read any, others cannot", async () => {
    await assertSucceeds(getDoc(doc(customer("alice"), "users/alice")));
    await assertSucceeds(getDoc(doc(admin(), "users/alice")));
    await assertFails(getDoc(doc(customer("bob"), "users/alice")));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });

  it("a user can change their display name", async () => {
    await assertSucceeds(updateDoc(doc(customer("alice"), "users/alice"), { displayName: "Alice Mensah" }));
  });

  it("rejects an over-long or non-string display name", async () => {
    await assertFails(updateDoc(doc(customer("alice"), "users/alice"), { displayName: "x".repeat(81) }));
    await assertFails(updateDoc(doc(customer("alice"), "users/alice"), { displayName: 42 }));
  });

  it("a user cannot grant themselves a role or lift their own suspension", async () => {
    await assertFails(updateDoc(doc(customer("alice"), "users/alice"), { capabilities: { admin: true, tech: true } }));
    // Smuggling a role change alongside an allowed field is still rejected.
    await assertFails(updateDoc(doc(customer("alice"), "users/alice"), { displayName: "A", capabilities: { tech: true, admin: false } }));
    await assertFails(updateDoc(doc(customer("sam"), "users/sam"), { status: "ACTIVE" }));
  });

  it("a suspended user cannot edit their account at all", async () => {
    await assertFails(updateDoc(doc(customer("sam"), "users/sam"), { displayName: "Sam 2" }));
  });

  it("nobody edits another user's account from a client, not even an admin", async () => {
    await assertFails(updateDoc(doc(customer("bob"), "users/alice"), { displayName: "hacked" }));
    await assertFails(updateDoc(doc(admin(), "users/alice"), { status: "SUSPENDED" }));
  });

  it("accounts are never created or deleted from a client", async () => {
    await assertFails(setDoc(doc(customer("newbie"), "users/newbie"), { displayName: "N", status: "ACTIVE" }));
    await assertFails(deleteDoc(doc(customer("alice"), "users/alice")));
  });
});

describe("auth internals are server-only", () => {
  it("OTP challenges and rate limits are unreadable and unwritable for everyone", async () => {
    for (const db of [anon(), customer(), technician(), admin()]) {
      await assertFails(getDoc(doc(db, "otpChallenges/+233241234567")));
      await assertFails(setDoc(doc(db, "otpChallenges/+233241234567"), { attempts: 0 }));
      await assertFails(getDoc(doc(db, "rateLimits/otp_ip_abc")));
      await assertFails(setDoc(doc(db, "rateLimits/otp_ip_abc"), { count: 0 }));
    }
  });
});
