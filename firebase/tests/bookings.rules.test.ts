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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** Bookings, status history and private contact (Stage 7). All writes are server-only. */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-serviceflow",
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});
afterAll(async () => env?.cleanup());

const booking = (status: string, extra: Record<string, unknown>) => ({
  customerId: "cust",
  technicianId: null,
  offeredTechnicianId: null,
  participantIds: ["cust"],
  status,
  createdAt: new Date("2026-10-01T09:00:00Z"),
  ...extra,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "bookings/offered"), booking("OFFERED", { offeredTechnicianId: "tech", participantIds: ["cust", "tech"] }));
    await setDoc(doc(db, "bookings/accepted"), booking("ACCEPTED", { technicianId: "tech", participantIds: ["cust", "tech"] }));
    await setDoc(doc(db, "bookings/done"), booking("CUSTOMER_CONFIRMED", { technicianId: "tech", participantIds: ["cust", "tech"] }));
    for (const id of ["offered", "accepted", "done"]) {
      await setDoc(doc(db, `bookings/${id}/private/contact`), { customerPhone: "+233241234567" });
      await setDoc(doc(db, `bookings/${id}/statusHistory/h1`), { to: "REQUESTED" });
      await setDoc(doc(db, `bookings/${id}/requests/cust_req1`), { action: "x" });
    }
  });
});

const as = (uid: string, claims: Record<string, unknown> = {}): Firestore =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

describe("bookings", () => {
  it("participants and admins read; strangers and signed-out visitors don't", async () => {
    await assertSucceeds(getDoc(doc(as("cust"), "bookings/offered")));
    await assertSucceeds(getDoc(doc(as("tech", { tech: true }), "bookings/offered")));
    await assertSucceeds(getDoc(doc(as("boss", { admin: true }), "bookings/offered")));
    await assertFails(getDoc(doc(as("stranger"), "bookings/offered")));
    await assertFails(getDoc(doc(as("other-tech", { tech: true }), "bookings/offered")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, "bookings/offered")));
  });

  it("lists only with a participantIds filter on yourself", async () => {
    const mine = query(collection(as("cust"), "bookings"), where("participantIds", "array-contains", "cust"), orderBy("createdAt", "desc"));
    await assertSucceeds(getDocs(mine));
    await assertFails(getDocs(query(collection(as("cust"), "bookings"), where("customerId", "==", "cust"))));
    await assertFails(getDocs(query(collection(as("cust"), "bookings"), where("participantIds", "array-contains", "tech"))));
    await assertSucceeds(getDocs(query(collection(as("boss", { admin: true }), "bookings"), where("status", "==", "OFFERED"))));
  });

  it("nobody writes a booking from a client — not even its customer or an admin", async () => {
    for (const db of [as("cust"), as("tech", { tech: true }), as("boss", { admin: true })]) {
      await assertFails(updateDoc(doc(db, "bookings/accepted"), { status: "COMPLETED" }));
      await assertFails(setDoc(doc(db, "bookings/new"), booking("REQUESTED", {})));
      await assertFails(deleteDoc(doc(db, "bookings/accepted")));
    }
    await assertFails(updateDoc(doc(as("cust"), "bookings/accepted"), { "pricing.finalMinor": 1 }));
  });
});

describe("status history", () => {
  it("is readable by participants and admins, and append-only for the server", async () => {
    await assertSucceeds(getDocs(collection(as("cust"), "bookings/accepted/statusHistory")));
    await assertSucceeds(getDocs(collection(as("tech", { tech: true }), "bookings/accepted/statusHistory")));
    await assertSucceeds(getDocs(collection(as("boss", { admin: true }), "bookings/accepted/statusHistory")));
    await assertFails(getDocs(collection(as("stranger"), "bookings/accepted/statusHistory")));
    await assertFails(addDoc(collection(as("cust"), "bookings/accepted/statusHistory"), { to: "CANCELLED" }));
    await assertFails(updateDoc(doc(as("boss", { admin: true }), "bookings/accepted/statusHistory/h1"), { to: "PAID" }));
  });
});

describe("private contact", () => {
  it("the customer and admins always; the technician only once they've accepted and while the job runs", async () => {
    await assertSucceeds(getDoc(doc(as("cust"), "bookings/offered/private/contact")));
    await assertSucceeds(getDoc(doc(as("boss", { admin: true }), "bookings/offered/private/contact")));
    // Offered but not accepted: no phone number yet.
    await assertFails(getDoc(doc(as("tech", { tech: true }), "bookings/offered/private/contact")));
    await assertSucceeds(getDoc(doc(as("tech", { tech: true }), "bookings/accepted/private/contact")));
    // After the job is confirmed the technician no longer sees it.
    await assertFails(getDoc(doc(as("tech", { tech: true }), "bookings/done/private/contact")));
    await assertFails(getDoc(doc(as("stranger"), "bookings/accepted/private/contact")));
    await assertFails(setDoc(doc(as("cust"), "bookings/accepted/private/contact"), { customerPhone: "+233200000000" }));
  });
});

describe("idempotency receipts", () => {
  it("are server-only", async () => {
    await assertFails(getDoc(doc(as("cust"), "bookings/accepted/requests/cust_req1")));
    await assertFails(getDoc(doc(as("boss", { admin: true }), "bookings/accepted/requests/cust_req1")));
    await assertFails(setDoc(doc(as("cust"), "bookings/accepted/requests/cust_req2"), { action: "fake" }));
  });
});
