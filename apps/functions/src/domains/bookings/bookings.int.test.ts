import { paths } from "@serviceflow/firebase";
import { AppError, BookingStatus, UserStatus, bookingContactDoc, bookingDoc, bookingStatusHistoryDoc } from "@serviceflow/shared";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminActionRef } from "../../lib/audit";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { MAX_OPEN_BOOKINGS, createBooking } from "./create";
import { advanceJob, cancelBooking, confirmCompletion, reassignBooking, respondToOffer } from "./lifecycle";
import { respondToQuote, setBookingPrice, submitQuote } from "./pricing";

const { db } = adminClients();
const NOW = Date.UTC(2026, 9, 2, 9, 0);
const deps = { db, now: () => NOW };
const CUSTOMER = "cust-1";
const OTHER_CUSTOMER = "cust-2";
const TECH = "tech-1";
const TECH_2 = "tech-2";
const ADMIN = "admin-1";
let n = 0;
const req = () => `req_book_${++n}_${Date.now()}`;

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  return err as AppError;
}

async function user(uid: string, phone: string | null, displayName: string) {
  await db.doc(paths.user(uid)).set({
    phone,
    email: null,
    displayName,
    status: UserStatus.ACTIVE,
    capabilities: { tech: false, admin: false },
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function technician(uid: string, overrides: Record<string, unknown> = {}) {
  await db.doc(paths.technician(uid)).set({
    displayName: `Tech ${uid}`,
    photoPath: null,
    verificationStatus: "VERIFIED",
    isOnline: true,
    activeBookingId: null,
    stats: { ratingSum: 0, ratingCount: 0, avgRating: 0, completed: 0, cancelled: 0, offered: 0, responded: 0 },
    ...overrides,
  });
}

async function fixtures() {
  await db.doc(paths.service("plumbing")).set({
    name: "Plumbing",
    slug: "plumbing",
    description: "",
    iconPath: null,
    priceRange: { minMinor: 10000, maxMinor: 30000 },
    isActive: true,
    sortOrder: 1,
  });
  await db.doc(paths.service("retired")).set({
    name: "Retired",
    slug: "retired",
    description: "",
    iconPath: null,
    priceRange: { minMinor: 100, maxMinor: 200 },
    isActive: false,
    sortOrder: 2,
  });
  await user(CUSTOMER, "+233241234567", "Ama Mensah");
  await db.doc(paths.customer(CUSTOMER)).set({ fullName: "Ama Mensah", defaultAddressId: "home" });
  await db.doc(paths.customerAddress(CUSTOMER, "home")).set({
    label: "Home",
    directions: "Opposite Shell, second gate on the left",
    ghanaPostGps: "GA-543-0125",
    areaId: "osu",
    areaName: "Osu",
    location: { lat: 5.5558, lng: -0.1793 },
    notes: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await user(OTHER_CUSTOMER, "+233201112223", "Kofi Boateng");
  await technician(TECH);
  await technician(TECH_2);
  await db.doc(paths.commissionRule("global")).set({
    scope: "GLOBAL",
    serviceId: null,
    technicianId: null,
    percent: 12,
    isActive: true,
    createdAt: Timestamp.fromMillis(NOW - 86_400_000),
  });
}

const create = (uid = CUSTOMER, extra: Record<string, unknown> = {}) =>
  createBooking(
    deps,
    uid,
    { requestId: req(), serviceId: "plumbing", problemDescription: "Kitchen sink pipe is leaking", addressId: "home", preferredTime: "ASAP", ...extra },
    "WEB",
  );

const read = async (id: string) => bookingDoc.parse((await db.doc(paths.booking(id)).get()).data());
const tech = async (uid: string) => (await db.doc(paths.technician(uid)).get()).data()!;

/** Stands in for the Matching stage: offers the booking to a technician. */
async function offer(id: string, techUid = TECH, expiresAtMs = NOW + 10 * 60_000) {
  await db.doc(paths.booking(id)).update({
    status: BookingStatus.OFFERED,
    offeredTechnicianId: techUid,
    participantIds: FieldValue.arrayUnion(techUid),
    offerExpiresAt: Timestamp.fromMillis(expiresAtMs),
  });
}

async function accepted() {
  const { id } = await create();
  await offer(id);
  await respondToOffer(deps, TECH, { requestId: req(), bookingId: id, accept: true });
  return id;
}

async function readyToStart() {
  const id = await accepted();
  await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE });
  await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED });
  await submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 25000 });
  await respondToQuote(deps, CUSTOMER, { requestId: req(), bookingId: id, accept: true });
  return id;
}

beforeEach(async () => {
  await resetEmulators();
  await fixtures();
});

afterAll(async () => {
  await closeAdminClients();
});

describe("bookings-create", () => {
  it("creates a REQUESTED booking from a saved address, with private contact and history", async () => {
    const { id } = await create();
    const b = await read(id);
    expect(b).toMatchObject({
      customerId: CUSTOMER,
      status: BookingStatus.REQUESTED,
      participantIds: [CUSTOMER],
      serviceSnapshot: { name: "Plumbing" },
      location: { lat: 5.5558, lng: -0.1793, address: "Home, Osu", areaId: "osu" },
      pricing: { estimateMinMinor: 10000, estimateMaxMinor: 30000, quoteStatus: "NONE", finalMinor: null, currency: "GHS" },
      source: "WEB",
    });
    expect(b.timeline.requestedAt).toBeDefined();
    const contact = bookingContactDoc.parse((await db.doc(paths.bookingContact(id)).get()).data());
    expect(contact).toEqual({
      customerName: "Ama Mensah",
      customerPhone: "+233241234567",
      directions: "Opposite Shell, second gate on the left",
      ghanaPostGps: "GA-543-0125",
      notes: null,
    });
    const history = await db.collection(paths.bookingStatusHistory(id)).get();
    expect(history.docs.map((d) => bookingStatusHistoryDoc.parse(d.data()))).toMatchObject([
      { from: null, to: "REQUESTED", actor: "CUSTOMER", byUid: CUSTOMER },
    ]);
  });

  it("is idempotent per request id", async () => {
    const input = { requestId: req(), serviceId: "plumbing", problemDescription: "Kitchen sink pipe is leaking", addressId: "home", preferredTime: "ASAP" as const };
    const a = await createBooking(deps, CUSTOMER, input, "WEB");
    const b = await createBooking(deps, CUSTOMER, input, "WEB");
    expect(b.id).toBe(a.id);
    expect((await db.collection("bookings").get()).size).toBe(1);
    expect((await db.collection(paths.bookingStatusHistory(a.id)).get()).size).toBe(1);
  });

  it("accepts a location pin (WhatsApp-style) without an address", async () => {
    const { id } = await create(CUSTOMER, { addressId: undefined, location: { lat: 5.6, lng: -0.18, notes: "Blue gate" } });
    expect((await read(id)).location).toEqual({ lat: 5.6, lng: -0.18, address: null, areaId: null });
    expect((await db.doc(paths.bookingContact(id)).get()).get("notes")).toBe("Blue gate");
  });

  it("refuses hidden services, bad times, other people's addresses and too many open bookings", async () => {
    expect((await failure(create(CUSTOMER, { serviceId: "retired" }))).message).toMatch(/isn't available/);
    expect((await failure(create(CUSTOMER, { preferredTime: "SCHEDULED", scheduledAt: new Date(NOW + 10 * 60_000).toISOString() }))).message).toMatch(
      /60 minutes/,
    );
    expect((await failure(create(OTHER_CUSTOMER))).code).toBe("NOT_FOUND"); // "home" belongs to CUSTOMER
    for (let i = 0; i < MAX_OPEN_BOOKINGS; i++) await create();
    expect((await failure(create())).message).toMatch(/already have 3 open bookings/);
  });

  it("stores a valid scheduled time", async () => {
    const at = NOW + 26 * 3_600_000;
    const { id } = await create(CUSTOMER, { preferredTime: "SCHEDULED", scheduledAt: new Date(at).toISOString() });
    expect((await read(id)).scheduledAt?.toMillis()).toBe(at);
  });
});

describe("offers", () => {
  it("accepting assigns the technician, makes them busy and counts the response", async () => {
    const id = await accepted();
    const b = await read(id);
    expect(b).toMatchObject({ status: "ACCEPTED", technicianId: TECH, offeredTechnicianId: null, technicianSnapshot: { displayName: "Tech tech-1" } });
    expect(b.participantIds).toEqual([CUSTOMER, TECH]);
    expect(await tech(TECH)).toMatchObject({ activeBookingId: id, stats: { responded: 1 } });
  });

  it("declining returns the job to matching and removes the technician from it", async () => {
    const { id } = await create();
    await offer(id);
    await respondToOffer(deps, TECH, { requestId: req(), bookingId: id, accept: false, reason: "Too far" });
    const b = await read(id);
    expect(b).toMatchObject({ status: "MATCHING", offeredTechnicianId: null, declinedTechnicianIds: [TECH], participantIds: [CUSTOMER] });
    expect((await tech(TECH)).stats.responded).toBe(1);
    const notes = (await db.collection(paths.bookingStatusHistory(id)).get()).docs.map((d) => d.get("note"));
    expect(notes).toContain("Too far");
  });

  it("refuses other technicians, expired offers, unverified and busy technicians", async () => {
    const { id } = await create();
    await offer(id);
    expect((await failure(respondToOffer(deps, TECH_2, { requestId: req(), bookingId: id, accept: true }))).message).toMatch(/no longer offered/);

    await offer(id, TECH, NOW - 1);
    expect((await failure(respondToOffer(deps, TECH, { requestId: req(), bookingId: id, accept: true }))).message).toMatch(/expired/);

    await offer(id);
    await technician(TECH, { verificationStatus: "SUSPENDED" });
    expect((await failure(respondToOffer(deps, TECH, { requestId: req(), bookingId: id, accept: true }))).message).toMatch(/verified/);

    await technician(TECH, { activeBookingId: "some-other-job" });
    expect((await failure(respondToOffer(deps, TECH, { requestId: req(), bookingId: id, accept: true }))).message).toMatch(/current job/);
  });
});

describe("job steps and price agreement (Decision D4)", () => {
  it("runs the whole job: quote, decline, re-quote, accept, work, confirm with commission snapshot", async () => {
    const id = await accepted();
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED });

    // No work before a price is agreed.
    expect((await failure(advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.IN_PROGRESS }))).message).toMatch(
      /accept your price/,
    );
    // Quotes stay inside the service range.
    const outOfRange = await failure(submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 45000 }));
    expect(outOfRange.message).toMatch(/between GH₵\s?100\.00 and GH₵\s?300\.00/);

    await submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 28000, note: "Needs a new trap" });
    await respondToQuote(deps, CUSTOMER, { requestId: req(), bookingId: id, accept: false, reason: "Too expensive" });
    expect((await read(id)).pricing).toMatchObject({ quoteStatus: "REJECTED", quoteRejectionReason: "Too expensive" });

    await submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 25000 });
    await respondToQuote(deps, CUSTOMER, { requestId: req(), bookingId: id, accept: true });
    expect((await read(id)).pricing).toMatchObject({ quotedMinor: 25000, quoteStatus: "ACCEPTED", priceSetBy: "TECHNICIAN", quoteRejectionReason: null });
    expect((await failure(submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 30000 }))).message).toMatch(/already accepted/);

    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.IN_PROGRESS });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.COMPLETED });
    expect((await tech(TECH)).activeBookingId).toBeNull();

    await confirmCompletion(deps, CUSTOMER, { requestId: req(), bookingId: id });
    const b = await read(id);
    expect(b.status).toBe("CUSTOMER_CONFIRMED");
    expect(b.pricing).toMatchObject({ finalMinor: 25000, commissionPercentSnapshot: 12 });
    expect(Object.keys(b.timeline).sort()).toEqual(
      ["acceptedAt", "arrivedAt", "completedAt", "confirmedAt", "enRouteAt", "requestedAt", "startedAt"].sort(),
    );
    expect((await tech(TECH)).stats.completed).toBe(1);
    // REQUESTED, ACCEPTED, EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED, CUSTOMER_CONFIRMED (+ the seeded offer isn't a transition)
    const history = (await db.collection(paths.bookingStatusHistory(id)).orderBy("createdAt").get()).docs.map((d) => d.get("to"));
    expect(history).toEqual(["REQUESTED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CUSTOMER_CONFIRMED"]);
  });

  it("only the assigned technician advances, only the customer answers and confirms", async () => {
    const id = await accepted();
    expect((await failure(advanceJob(deps, TECH_2, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE }))).code).toBe("FORBIDDEN");
    expect((await failure(advanceJob(deps, CUSTOMER, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE }))).code).toBe("FORBIDDEN");
    // Skipping a step is refused by the state machine.
    expect((await failure(advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED }))).code).toBe(
      "INVALID_STATE_TRANSITION",
    );
    await submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 20000 });
    expect((await failure(respondToQuote(deps, OTHER_CUSTOMER, { requestId: req(), bookingId: id, accept: true }))).code).toBe("FORBIDDEN");
    expect((await failure(confirmCompletion(deps, CUSTOMER, { requestId: req(), bookingId: id }))).message).toMatch(/after the technician/);
  });

  it("uses a technician-specific commission rule over the global one", async () => {
    await db.doc(paths.commissionRule("tech1")).set({
      scope: "TECHNICIAN",
      serviceId: null,
      technicianId: TECH,
      percent: 8,
      isActive: true,
      createdAt: Timestamp.fromMillis(NOW - 3600_000),
    });
    const id = await readyToStart();
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.IN_PROGRESS });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.COMPLETED });
    await confirmCompletion(deps, CUSTOMER, { requestId: req(), bookingId: id });
    expect((await read(id)).pricing.commissionPercentSnapshot).toBe(8);
  });

  it("retries of the same request are no-ops, not errors", async () => {
    const id = await accepted();
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE });
    await submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 20000 });
    const answer = { requestId: req(), bookingId: id, accept: true };
    await respondToQuote(deps, CUSTOMER, answer);
    await expect(respondToQuote(deps, CUSTOMER, answer)).resolves.toEqual({ ok: true, id });
    const step = { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED };
    await advanceJob(deps, TECH, step);
    await advanceJob(deps, TECH, step);
    const arrivals = (await db.collection(paths.bookingStatusHistory(id)).where("to", "==", "ARRIVED").get()).size;
    expect(arrivals).toBe(1);
  });
});

describe("cancellation (D-1: ownership)", () => {
  it("strangers and merely-offered technicians can't cancel", async () => {
    const { id } = await create();
    await offer(id);
    const stranger = await failure(cancelBooking(deps, { uid: OTHER_CUSTOMER, isAdmin: false }, { requestId: req(), bookingId: id, reason: "Not mine" }));
    expect(stranger.code).toBe("FORBIDDEN");
    const offered = await failure(cancelBooking(deps, { uid: TECH, isAdmin: false }, { requestId: req(), bookingId: id, reason: "No thanks" }));
    expect(offered.code).toBe("FORBIDDEN");
    expect((await read(id)).status).toBe("OFFERED");
  });

  it("the customer cancels an open request, recording who and why", async () => {
    const { id } = await create();
    await cancelBooking(deps, { uid: CUSTOMER, isAdmin: false }, { requestId: req(), bookingId: id, reason: "Fixed it myself" });
    const b = await read(id);
    expect(b.status).toBe("CANCELLED");
    expect(b.cancellation).toMatchObject({ byUid: CUSTOMER, actor: "CUSTOMER", reason: "Fixed it myself" });
  });

  it("the assigned technician cancelling frees them and counts against them", async () => {
    const id = await accepted();
    await cancelBooking(deps, { uid: TECH, isAdmin: false }, { requestId: req(), bookingId: id, reason: "Motorbike broke down" });
    expect(await tech(TECH)).toMatchObject({ activeBookingId: null, stats: { cancelled: 1 } });
  });

  it("once the technician has arrived only an admin can cancel, and it is audited", async () => {
    const id = await accepted();
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED });
    const byCustomer = await failure(cancelBooking(deps, { uid: CUSTOMER, isAdmin: false }, { requestId: req(), bookingId: id, reason: "Changed mind" }));
    expect(byCustomer.code).toBe("FORBIDDEN");
    const requestId = req();
    await cancelBooking(deps, { uid: ADMIN, isAdmin: true }, { requestId, bookingId: id, reason: "Customer not home, agreed by phone" });
    expect((await read(id)).status).toBe("CANCELLED");
    expect(await tech(TECH)).toMatchObject({ activeBookingId: null, stats: { cancelled: 0 } });
    expect((await adminActionRef(db, ADMIN, requestId).get()).data()).toMatchObject({ actionType: "BOOKING_CANCELLED", targetId: id });
  });
});

describe("admin booking tools", () => {
  it("sets any price with an audited reason, which then allows work to start", async () => {
    const id = await accepted();
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED });
    const requestId = req();
    await setBookingPrice(deps, ADMIN, { requestId, bookingId: id, amountMinor: 52000, reason: "Two pipes replaced, agreed with both" });
    expect((await read(id)).pricing).toMatchObject({ quotedMinor: 52000, quoteStatus: "ACCEPTED", priceSetBy: "ADMIN" });
    expect((await adminActionRef(db, ADMIN, requestId).get()).data()).toMatchObject({
      actionType: "BOOKING_PRICE_SET",
      after: { quotedMinor: 52000 },
    });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.IN_PROGRESS });
  });

  it("can't set a price before a technician is assigned", async () => {
    const { id } = await create();
    expect((await failure(setBookingPrice(deps, ADMIN, { requestId: req(), bookingId: id, amountMinor: 1000, reason: "Test" }))).code).toBe("CONFLICT");
  });

  it("reassigns an offered job back to matching (audited), but not an accepted one", async () => {
    const { id } = await create();
    await offer(id);
    const requestId = req();
    await reassignBooking(deps, ADMIN, { requestId, bookingId: id, reason: "Technician unreachable" });
    expect(await read(id)).toMatchObject({ status: "MATCHING", offeredTechnicianId: null, participantIds: [CUSTOMER] });
    expect((await adminActionRef(db, ADMIN, requestId).get()).get("actionType")).toBe("BOOKING_REASSIGNED");

    const acceptedId = await accepted();
    expect((await failure(reassignBooking(deps, ADMIN, { requestId: req(), bookingId: acceptedId, reason: "Swap" }))).code).toBe(
      "INVALID_STATE_TRANSITION",
    );
  });
});
