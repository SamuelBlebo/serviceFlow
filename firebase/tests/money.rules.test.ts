import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { type Firestore, collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** Payments, wallets and ledgers (Stage 11): read by the people involved, written only by Functions. */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-serviceflow",
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "payments/bk1"), { customerId: "cust", technicianId: "tech", amountMinor: 25000, status: "PENDING" });
    await setDoc(doc(db, "payments/bk1/transactions/1"), { attempt: 1, msisdnMasked: "+233 24 *** 4567" });
    await setDoc(doc(db, "payments/bk1/requests/cust_r1"), { attempt: 1 });
    await setDoc(doc(db, "wallets/tech"), { availableMinor: 21250, pendingPayoutMinor: 0 });
    await setDoc(doc(db, "wallets/tech/transactions/earning_bk1"), { type: "EARNING_CREDIT", amountMinor: 25000 });
    await setDoc(doc(db, "paymentWebhookEvents/mock_evt1"), { reference: "x" });
  });
});

const as = (uid: string, claims: Record<string, unknown> = {}): Firestore => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const admin = () => as("boss", { admin: true });

describe("payments", () => {
  it("the customer, the technician and admins can see a payment; others can't", async () => {
    await assertSucceeds(getDoc(doc(as("cust"), "payments/bk1")));
    await assertSucceeds(getDoc(doc(as("tech", { tech: true }), "payments/bk1")));
    await assertSucceeds(getDoc(doc(admin(), "payments/bk1")));
    await assertFails(getDoc(doc(as("stranger"), "payments/bk1")));
  });

  it("nobody marks a payment paid from a client — not the customer, the technician or an admin", async () => {
    for (const db of [as("cust"), as("tech", { tech: true }), admin()]) {
      await assertFails(updateDoc(doc(db, "payments/bk1"), { status: "SUCCEEDED" }));
      await assertFails(setDoc(doc(db, "payments/bk2"), { customerId: "cust", status: "SUCCEEDED" }));
    }
  });

  it("the attempt log is for the payer and admins; idempotency receipts are server-only", async () => {
    await assertSucceeds(getDocs(collection(as("cust"), "payments/bk1/transactions")));
    await assertSucceeds(getDocs(collection(admin(), "payments/bk1/transactions")));
    await assertFails(getDocs(collection(as("tech", { tech: true }), "payments/bk1/transactions")));
    await assertFails(getDoc(doc(as("cust"), "payments/bk1/requests/cust_r1")));
  });
});

describe("wallets", () => {
  it("only the technician and admins read the wallet and ledger", async () => {
    await assertSucceeds(getDoc(doc(as("tech", { tech: true }), "wallets/tech")));
    await assertSucceeds(getDocs(collection(as("tech", { tech: true }), "wallets/tech/transactions")));
    await assertSucceeds(getDoc(doc(admin(), "wallets/tech")));
    await assertFails(getDoc(doc(as("cust"), "wallets/tech")));
    await assertFails(getDoc(doc(as("other-tech", { tech: true }), "wallets/tech")));
  });

  it("no client can change a balance or post a ledger entry", async () => {
    await assertFails(updateDoc(doc(as("tech", { tech: true }), "wallets/tech"), { availableMinor: 9999999 }));
    await assertFails(setDoc(doc(as("tech", { tech: true }), "wallets/tech/transactions/fake"), { type: "ADJUSTMENT_CREDIT", amountMinor: 100000 }));
    await assertFails(setDoc(doc(admin(), "wallets/tech/transactions/fake"), { type: "ADJUSTMENT_CREDIT", amountMinor: 100000 }));
  });

  it("webhook events stay server-only", async () => {
    await assertFails(getDoc(doc(admin(), "paymentWebhookEvents/mock_evt1")));
  });
});
