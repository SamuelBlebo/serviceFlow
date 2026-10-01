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
    await setDoc(doc(db, "users/alice"), { displayName: "Alice", status: "ACTIVE" });
    await setDoc(doc(db, "users/bob"), { displayName: "Bob", status: "ACTIVE" });
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
    for (const db of [anon(), customer(), technician(), admin()]) {
      await assertFails(getDoc(doc(db, "bookings/b1")));
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

  it("a user cannot grant themselves a role by writing their user document", async () => {
    await assertFails(updateDoc(doc(customer("alice"), "users/alice"), { capabilities: { admin: true, tech: true } }));
  });
});
