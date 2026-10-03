import { paths } from "@serviceflow/firebase";
import { AppError, BookingStatus, DEFAULT_PLATFORM_SETTINGS, UserStatus, paymentDoc, walletTransactionDoc } from "@serviceflow/shared";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MOCK_WEBHOOK_SECRET } from "../../integrations/payments/factory";
import { MockPaymentProvider } from "../../integrations/payments/mock-payment-provider";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { createBooking } from "../bookings/create";
import { advanceJob, confirmCompletion, respondToOffer } from "../bookings/lifecycle";
import { respondToQuote, submitQuote } from "../bookings/pricing";
import { confirmCashPayment, handlePaymentEvent, initiatePayment, reconcilePayments } from "./payments";

const { db } = adminClients();
const NOW = Date.UTC(2026, 9, 2, 9, 0);
let clock = NOW;
const provider = new MockPaymentProvider(db, MOCK_WEBHOOK_SECRET);
const deps = { db, provider, now: () => clock };
const CUSTOMER = "cust-1";
const TECH = "tech-1";
let n = 0;
const req = () => `req_pay_${++n}_${Date.now()}`;

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  return err as AppError;
}

async function fixtures() {
  await db.doc(paths.platformSettings()).set(DEFAULT_PLATFORM_SETTINGS); // 15% default commission, cash allowed
  await db.doc(paths.service("plumbing")).set({ name: "Plumbing", slug: "plumbing", description: "", iconPath: null, priceRange: { minMinor: 10000, maxMinor: 30000 }, isActive: true, sortOrder: 1 });
  await db.doc(paths.user(CUSTOMER)).set({ phone: "+233241234567", email: null, displayName: "Ama", status: UserStatus.ACTIVE, capabilities: { tech: false, admin: false }, createdAt: FieldValue.serverTimestamp() });
  await db.doc(paths.customerAddress(CUSTOMER, "home")).set({
    label: "Home", directions: "Blue gate", ghanaPostGps: null, areaId: "osu", areaName: "Osu", location: { lat: 5.55, lng: -0.17 }, notes: null,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc(paths.technician(TECH)).set({
    displayName: "Kojo", photoPath: null, verificationStatus: "VERIFIED", isOnline: true, activeBookingId: null,
    stats: { ratingSum: 0, ratingCount: 0, avgRating: 0, completed: 0, cancelled: 0, offered: 0, responded: 0 },
  });
  await db.doc(paths.wallet(TECH)).set({ availableMinor: 0, pendingPayoutMinor: 0, lifetimeEarningsMinor: 0, currency: "GHS", lastEntryId: null, entryCount: 0, updatedAt: FieldValue.serverTimestamp() });
}

/** A job taken all the way to customer confirmation at GH₵250 → invoice created. */
async function confirmedJob(amountMinor = 25000) {
  const bdeps = { db, now: () => clock };
  const { id } = await createBooking(bdeps, CUSTOMER, { requestId: req(), serviceId: "plumbing", problemDescription: "Kitchen sink pipe is leaking", addressId: "home", preferredTime: "ASAP" }, "WEB");
  await db.doc(paths.booking(id)).update({ status: "OFFERED", offeredTechnicianId: TECH, participantIds: FieldValue.arrayUnion(TECH), offerExpiresAt: Timestamp.fromMillis(clock + 600_000) });
  await respondToOffer(bdeps, TECH, { requestId: req(), bookingId: id, accept: true });
  for (const to of [BookingStatus.EN_ROUTE, BookingStatus.ARRIVED]) await advanceJob(bdeps, TECH, { requestId: req(), bookingId: id, to });
  await submitQuote(bdeps, TECH, { requestId: req(), bookingId: id, amountMinor });
  await respondToQuote(bdeps, CUSTOMER, { requestId: req(), bookingId: id, accept: true });
  for (const to of [BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED]) await advanceJob(bdeps, TECH, { requestId: req(), bookingId: id, to });
  await confirmCompletion(bdeps, CUSTOMER, { requestId: req(), bookingId: id });
  return id;
}

const payment = async (id: string) => paymentDoc.parse((await db.doc(paths.payment(id)).get()).data());
const bookingStatus = async (id: string) => (await db.doc(paths.booking(id)).get()).get("status");
const wallet = async () => (await db.doc(paths.wallet(TECH)).get()).data()!;
const ledger = async () => (await db.collection(`${paths.wallet(TECH)}/transactions`).get()).docs.map((d) => ({ id: d.id, ...walletTransactionDoc.parse(d.data()) }));
const momo = (bookingId: string, requestId = req()) =>
  initiatePayment(deps, CUSTOMER, { requestId, bookingId, method: "MOBILE_MONEY", msisdn: "024 123 4567", network: "MTN_MOMO" });

/** The payer approves/declines in the sandbox; the signed webhook goes through verification. */
async function settle(bookingId: string, outcome: "SUCCEEDED" | "FAILED") {
  const p = await payment(bookingId);
  const webhook = await provider.settle(p.providerReference!, outcome);
  const event = provider.parseWebhook(Buffer.from(webhook.rawBody), webhook.headers)!;
  return { event, result: await handlePaymentEvent(deps, event) };
}

beforeEach(async () => {
  clock = NOW;
  await resetEmulators();
  await fixtures();
});

afterAll(async () => {
  await closeAdminClients();
});

describe("invoice", () => {
  it("confirmation creates the invoice from the locked price and commission", async () => {
    const id = await confirmedJob();
    expect(await payment(id)).toMatchObject({
      customerId: CUSTOMER,
      technicianId: TECH,
      amountMinor: 25000,
      commissionPercent: 15,
      commissionMinor: 3750,
      technicianNetMinor: 21250,
      status: "PENDING",
      method: null,
      attempts: 0,
    });
  });
});

describe("Mobile Money", () => {
  it("prompt → approval webhook → verified → booking PAID and the ledger posted, all at once", async () => {
    const id = await confirmedJob();
    await expect(momo(id)).resolves.toMatchObject({ status: "PENDING" });
    const p = await payment(id);
    expect(p).toMatchObject({ method: "MOBILE_MONEY", status: "PENDING", attempts: 1, provider: "mock", providerReference: `mock_${id}_1` });
    expect((await db.doc(`${paths.paymentTransactions(id)}/1`).get()).data()).toMatchObject({ status: "PENDING", msisdnMasked: "+233 24 *** 4567", network: "MTN_MOMO" });
    expect(await bookingStatus(id)).toBe("CUSTOMER_CONFIRMED"); // nothing is paid on the client's word

    expect((await settle(id, "SUCCEEDED")).result).toBe("paid");
    expect(await payment(id)).toMatchObject({ status: "SUCCEEDED" });
    expect(await bookingStatus(id)).toBe("PAID");
    const last = (await db.collection(paths.bookingStatusHistory(id)).orderBy("createdAt", "desc").limit(1).get()).docs[0]!.data();
    expect(last).toMatchObject({ from: "CUSTOMER_CONFIRMED", to: "PAID", actor: "SYSTEM" });
    expect(await wallet()).toMatchObject({ availableMinor: 21250, lifetimeEarningsMinor: 21250, entryCount: 2, lastEntryId: `commission_${id}` });
    const entries = await ledger();
    expect(entries.map((e) => [e.id, e.type, e.amountMinor, e.balanceAfter.availableMinor])).toEqual([
      [`commission_${id}`, "COMMISSION_DEBIT", 3750, 21250],
      [`earning_${id}`, "EARNING_CREDIT", 25000, 25000],
    ]);
    expect((await db.doc(`${paths.paymentTransactions(id)}/1`).get()).get("status")).toBe("SUCCEEDED");
  });

  it("a repeated webhook, or a new event for the same charge, never pays twice", async () => {
    const id = await confirmedJob();
    await momo(id);
    const { event } = await settle(id, "SUCCEEDED");
    await expect(handlePaymentEvent(deps, event)).resolves.toBe("duplicate");
    await expect(handlePaymentEvent(deps, { ...event, eventId: "evt_other" })).resolves.toBe("already");
    expect((await ledger()).length).toBe(2);
    expect((await wallet()).availableMinor).toBe(21250);
  });

  it("the webhook body alone is never trusted: a 'succeeded' event for an unapproved charge pays nothing", async () => {
    const id = await confirmedJob();
    await momo(id);
    const p = await payment(id);
    await expect(handlePaymentEvent(deps, { eventId: "evt_forged", type: "charge.updated", reference: p.providerReference!, status: "SUCCEEDED" })).resolves.toBe("pending");
    expect(await bookingStatus(id)).toBe("CUSTOMER_CONFIRMED");
    expect(await ledger()).toEqual([]);
  });

  it("a verified amount that doesn't match the invoice is refused", async () => {
    const id = await confirmedJob();
    await momo(id);
    const p = await payment(id);
    await db.collection("devMockPayments").doc(p.providerReference!).update({ amountMinor: 100 });
    expect((await settle(id, "SUCCEEDED")).result).toBe("mismatch");
    expect(await payment(id)).toMatchObject({ status: "FAILED" });
    expect(await bookingStatus(id)).toBe("CUSTOMER_CONFIRMED");
    expect(await ledger()).toEqual([]);
  });

  it("a declined prompt fails the attempt; the customer retries with a new attempt and succeeds", async () => {
    const id = await confirmedJob();
    await momo(id);
    expect((await settle(id, "FAILED")).result).toBe("failed");
    expect(await payment(id)).toMatchObject({ status: "FAILED", failureReason: expect.stringMatching(/declined/) });
    await momo(id);
    expect(await payment(id)).toMatchObject({ status: "PENDING", attempts: 2, providerReference: `mock_${id}_2` });
    await settle(id, "SUCCEEDED");
    expect(await bookingStatus(id)).toBe("PAID");
  });

  it("retrying the same request reuses the attempt (no second prompt)", async () => {
    const id = await confirmedJob();
    const requestId = req();
    await momo(id, requestId);
    await momo(id, requestId);
    expect((await payment(id)).attempts).toBe(1);
    expect((await db.collection(paths.paymentTransactions(id)).get()).size).toBe(1);
  });

  it("starting again while a charge is pending checks it first, so an approved charge isn't repeated", async () => {
    const id = await confirmedJob();
    await momo(id);
    const p = await payment(id);
    await db.collection("devMockPayments").doc(p.providerReference!).update({ status: "SUCCEEDED" }); // approved; webhook lost
    await expect(momo(id)).resolves.toMatchObject({ status: "SUCCEEDED" });
    expect(await payment(id)).toMatchObject({ attempts: 1, status: "SUCCEEDED" });
  });

  it("reconciliation settles charges whose webhook was lost", async () => {
    const id = await confirmedJob();
    await momo(id);
    const p = await payment(id);
    await db.collection("devMockPayments").doc(p.providerReference!).update({ status: "SUCCEEDED" });
    clock = NOW + 5 * 60_000;
    expect((await reconcilePayments(deps)).checked).toBe(0); // too recent
    clock = NOW + 11 * 60_000;
    expect(await reconcilePayments(deps)).toEqual({ checked: 1, paid: 1, failed: 0 });
    expect(await bookingStatus(id)).toBe("PAID");
  });
});

describe("cash (Decision D5)", () => {
  it("the customer chooses cash, the technician confirms receipt, and only the commission is debited", async () => {
    const id = await confirmedJob();
    await expect(initiatePayment(deps, CUSTOMER, { requestId: req(), bookingId: id, method: "CASH" })).resolves.toMatchObject({ status: "PENDING" });
    expect(await payment(id)).toMatchObject({ method: "CASH", cashStatus: "AWAITING_TECHNICIAN", status: "PENDING" });
    expect((await failure(confirmCashPayment(deps, CUSTOMER, { requestId: req(), bookingId: id }))).code).toBe("FORBIDDEN");
    await confirmCashPayment(deps, TECH, { requestId: req(), bookingId: id });
    expect(await payment(id)).toMatchObject({ status: "SUCCEEDED", cashStatus: "COLLECTED" });
    expect(await bookingStatus(id)).toBe("PAID");
    expect((await ledger()).map((e) => [e.type, e.amountMinor])).toEqual([["COMMISSION_DEBIT", 3750]]);
    expect((await wallet()).availableMinor).toBe(-3750); // commission owed
    // A retried confirmation changes nothing.
    await confirmCashPayment(deps, TECH, { requestId: req(), bookingId: id });
    expect((await ledger()).length).toBe(1);
  });

  it("a later Mobile Money job nets off the commission owed", async () => {
    const cash = await confirmedJob();
    await initiatePayment(deps, CUSTOMER, { requestId: req(), bookingId: cash, method: "CASH" });
    await confirmCashPayment(deps, TECH, { requestId: req(), bookingId: cash });
    await db.doc(paths.technician(TECH)).update({ activeBookingId: null });
    const electronic = await confirmedJob();
    await momo(electronic);
    await settle(electronic, "SUCCEEDED");
    expect((await wallet()).availableMinor).toBe(21250 - 3750);
  });

  it("is refused when cash is switched off", async () => {
    await db.doc(paths.platformSettings()).update({ cashAllowed: false });
    const id = await confirmedJob();
    expect((await failure(initiatePayment(deps, CUSTOMER, { requestId: req(), bookingId: id, method: "CASH" }))).message).toMatch(/Cash payment isn't available/);
  });

  it("the technician can't confirm cash the customer didn't choose", async () => {
    const id = await confirmedJob();
    await momo(id);
    expect((await failure(confirmCashPayment(deps, TECH, { requestId: req(), bookingId: id }))).code).toBe("CONFLICT");
  });
});

describe("who can pay what", () => {
  it("only the booking's customer, only after confirmation, never by card yet, never twice", async () => {
    const id = await confirmedJob();
    expect((await failure(initiatePayment(deps, "someone-else", { requestId: req(), bookingId: id, method: "CASH" }))).code).toBe("FORBIDDEN");
    expect((await failure(initiatePayment(deps, CUSTOMER, { requestId: req(), bookingId: id, method: "CARD" }))).message).toMatch(/Card payments/);
    expect((await failure(initiatePayment(deps, CUSTOMER, { requestId: req(), bookingId: "bk_nope", method: "CASH" }))).code).toBe("NOT_FOUND");
    await momo(id);
    await settle(id, "SUCCEEDED");
    expect((await failure(momo(id))).message).toMatch(/already paid/);
  });
});
