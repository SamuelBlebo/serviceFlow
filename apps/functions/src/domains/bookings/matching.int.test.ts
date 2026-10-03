import { paths } from "@serviceflow/firebase";
import { AppError, BookingStatus, UserStatus, bookingDoc } from "@serviceflow/shared";
import { FieldValue } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { createBooking } from "./create";
import { reassignBooking, respondToOffer } from "./lifecycle";
import { matchBooking, rematchBooking, rematchIfExhausted, selectTechnician, sweepBookings } from "./matching";

const { db } = adminClients();
// Friday 2 Oct 2026, 09:00 in Accra (UTC+0).
const NOW = Date.UTC(2026, 9, 2, 9, 0);
let clock = NOW;
const deps = { db, now: () => clock };
const CUSTOMER = "cust-1";
const OSU = { lat: 5.5558, lng: -0.1793 };
let n = 0;
const req = () => `req_match_${++n}_${Date.now()}`;

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  return err as AppError;
}

const weekdays = [1, 2, 3, 4, 5].map((day) => ({ day, start: "08:00", end: "18:00" }));

async function technician(uid: string, overrides: Record<string, unknown> = {}) {
  await db.doc(paths.technician(uid)).set({
    displayName: `Tech ${uid}`,
    photoPath: null,
    verificationStatus: "VERIFIED",
    isOnline: true,
    activeBookingId: null,
    serviceIds: ["plumbing"],
    serviceAreas: [{ areaId: "osu", name: "Osu", ...OSU, radiusKm: 8 }],
    weeklyAvailability: weekdays,
    stats: { ratingSum: 0, ratingCount: 0, avgRating: 4, completed: 10, cancelled: 0, offered: 10, responded: 10 },
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
  await db.doc(paths.user(CUSTOMER)).set({ phone: "+233241234567", email: null, displayName: "Ama", status: UserStatus.ACTIVE, capabilities: { tech: false, admin: false }, createdAt: FieldValue.serverTimestamp() });
  await db.doc(paths.customerAddress(CUSTOMER, "home")).set({
    label: "Home",
    directions: "Opposite Shell, blue gate",
    ghanaPostGps: null,
    areaId: "osu",
    areaName: "Osu",
    location: { lat: 5.556, lng: -0.18 },
    notes: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function newBooking(extra: Record<string, unknown> = {}) {
  const { id } = await createBooking(
    deps,
    CUSTOMER,
    { requestId: req(), serviceId: "plumbing", problemDescription: "Kitchen sink pipe is leaking", addressId: "home", preferredTime: "ASAP", ...extra },
    "WEB",
  );
  return id;
}

const read = async (id: string) => bookingDoc.parse((await db.doc(paths.booking(id)).get()).data());

beforeEach(async () => {
  clock = NOW;
  await resetEmulators();
  await fixtures();
});

afterAll(async () => {
  await closeAdminClients();
});

describe("matchBooking", () => {
  it("applies every hard filter and stores the top 3 ranked candidates", async () => {
    await technician("best", { stats: { ratingSum: 0, ratingCount: 0, avgRating: 4.9, completed: 120, cancelled: 1, offered: 50, responded: 50 } });
    await technician("good");
    await technician("new", { stats: { ratingSum: 0, ratingCount: 0, avgRating: 0, completed: 0, cancelled: 0, offered: 0, responded: 0 } });
    await technician("fourth", { stats: { ratingSum: 0, ratingCount: 0, avgRating: 1, completed: 0, cancelled: 5, offered: 10, responded: 1 } });
    await technician("offline", { isOnline: false });
    await technician("unverified", { verificationStatus: "PENDING" });
    await technician("electrician", { serviceIds: ["electrical"] });
    await technician("far", { serviceAreas: [{ areaId: "tema", name: "Tema", lat: 5.67, lng: 0.0, radiusKm: 10 }] });
    await technician("busy", { activeBookingId: "another-job" });
    await technician("weekend-only", { weeklyAvailability: [{ day: 6, start: "08:00", end: "18:00" }] });

    const id = await newBooking();
    await expect(matchBooking(deps, id)).resolves.toEqual({ candidates: 3 });
    const b = await read(id);
    expect(b.status).toBe("MATCHING");
    expect(b.candidates.map((c) => c.technicianId)).toEqual(["best", "good", "new"]);
    expect(b.candidates[0]).toMatchObject({ displayName: "Tech best", averageRating: 4.9, completedJobs: 120 });
    expect(b.candidates[0]!.distanceKm).toBeLessThan(1);
    expect(b.matchingExpiresAt?.toMillis()).toBe(NOW + 60 * 60_000);
    const history = (await db.collection(paths.bookingStatusHistory(id)).orderBy("createdAt").get()).docs.map((d) => [d.get("to"), d.get("actor")]);
    expect(history).toEqual([
      ["REQUESTED", "CUSTOMER"],
      ["MATCHING", "SYSTEM"],
    ]);
  });

  it("matches TOMORROW against tomorrow's hours (Saturday), not today's", async () => {
    await technician("weekday", { weeklyAvailability: weekdays });
    await technician("saturday", { weeklyAvailability: [{ day: 6, start: "08:00", end: "18:00" }] });
    const id = await newBooking({ preferredTime: "TOMORROW" });
    await matchBooking(deps, id);
    expect((await read(id)).candidates.map((c) => c.technicianId)).toEqual(["saturday"]);
  });

  it("uses the platform settings for radius and the customer's own provider account is excluded", async () => {
    await db.doc(paths.platformSettings()).set({
      defaultCommissionPercent: 15,
      currency: "GHS",
      country: "GH",
      timezone: "Africa/Accra",
      offerTimeoutMinutes: 5,
      matchingExpiryMinutes: 30,
      matchRadiusKm: 15,
      matchWeights: { distance: 1, rating: 0, completedJobs: 0, completionRate: 0, cancellationRate: 0, responseRate: 0 },
      minPayoutMinor: 2000,
      supportPhone: null,
    });
    await technician(CUSTOMER);
    await technician("near");
    await technician("further", { serviceAreas: [{ areaId: "x", name: "X", lat: 5.6, lng: -0.18, radiusKm: 8 }] });
    const id = await newBooking();
    await matchBooking(deps, id);
    const b = await read(id);
    expect(b.candidates.map((c) => c.technicianId)).toEqual(["near", "further"]); // distance-only weights
    expect(b.matchingExpiresAt?.toMillis()).toBe(NOW + 30 * 60_000);
  });

  it("with nobody available, waits in MATCHING with no candidates; a later search finds new technicians", async () => {
    const id = await newBooking();
    await matchBooking(deps, id);
    expect(await read(id)).toMatchObject({ status: "MATCHING", candidates: [] });
    await technician("late");
    const result = await rematchBooking(deps, CUSTOMER, { requestId: req(), bookingId: id });
    expect(result.candidates).toBe(1);
    expect((await read(id)).candidates.map((c) => c.technicianId)).toEqual(["late"]);
    expect((await failure(rematchBooking(deps, "someone-else", { requestId: req(), bookingId: id }))).code).toBe("FORBIDDEN");
  });
});

describe("bookings-selectTechnician (D-6)", () => {
  async function matched() {
    await technician("t1");
    await technician("t2", { stats: { ratingSum: 0, ratingCount: 0, avgRating: 3, completed: 1, cancelled: 0, offered: 1, responded: 1 } });
    await technician("outsider", { serviceAreas: [{ areaId: "tema", name: "Tema", lat: 5.67, lng: 0.0, radiusKm: 10 }] });
    const id = await newBooking();
    await matchBooking(deps, id);
    return id;
  }

  it("offers the job to a chosen candidate with a deadline and counts the offer", async () => {
    const id = await matched();
    await selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "t2" });
    const b = await read(id);
    expect(b).toMatchObject({ status: "OFFERED", offeredTechnicianId: "t2", participantIds: [CUSTOMER, "t2"] });
    expect(b.offerExpiresAt?.toMillis()).toBe(NOW + 10 * 60_000);
    expect((await db.doc(paths.technician("t2")).get()).get("stats.offered")).toBe(2);
  });

  it("refuses technicians who aren't candidates, other people's bookings, and candidates who became unavailable", async () => {
    const id = await matched();
    expect((await failure(selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "outsider" }))).message).toMatch(
      /recommended/,
    );
    expect((await failure(selectTechnician(deps, "stranger", { requestId: req(), bookingId: id, technicianId: "t1" }))).code).toBe("FORBIDDEN");
    await db.doc(paths.technician("t1")).update({ isOnline: false });
    expect((await failure(selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "t1" }))).message).toMatch(
      /no longer available/,
    );
    expect((await read(id)).status).toBe("MATCHING");
  });

  it("after a decline the customer chooses among the rest; when nobody is left, a new search runs", async () => {
    const id = await matched();
    await selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "t1" });
    await respondToOffer(deps, "t1", { requestId: req(), bookingId: id, accept: false, reason: "Too far" });
    await rematchIfExhausted(deps, id); // t2 is still selectable: no new search
    let b = await read(id);
    expect(b).toMatchObject({ status: "MATCHING", declinedTechnicianIds: ["t1"] });
    expect(b.candidates.map((c) => c.technicianId)).toEqual(["t1", "t2"]);

    await selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "t2" });
    await respondToOffer(deps, "t2", { requestId: req(), bookingId: id, accept: false });
    await technician("t3");
    await rematchIfExhausted(deps, id);
    b = await read(id);
    expect(b.candidates.map((c) => c.technicianId)).toEqual(["t3"]); // decliners excluded
  });

  it("admin reassignment returns the job to matching for the customer to choose again", async () => {
    const id = await matched();
    await selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "t1" });
    await reassignBooking(deps, "admin-1", { requestId: req(), bookingId: id, reason: "Technician unreachable" });
    const b = await read(id);
    expect(b).toMatchObject({ status: "MATCHING", offeredTechnicianId: null, participantIds: [CUSTOMER] });
  });
});

describe("sweepBookings (D-12)", () => {
  it("takes back unanswered offers and excludes that technician", async () => {
    await technician("slow");
    await technician("other");
    const id = await newBooking();
    await matchBooking(deps, id);
    await selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "slow" });

    clock = NOW + 9 * 60_000;
    expect((await sweepBookings(deps)).offersExpired).toBe(0);
    clock = NOW + 11 * 60_000;
    expect((await sweepBookings(deps)).offersExpired).toBe(1);
    const b = await read(id);
    expect(b).toMatchObject({ status: "MATCHING", offeredTechnicianId: null, declinedTechnicianIds: ["slow"], participantIds: [CUSTOMER] });
    // Going back to matching never shortens the customer's deadline.
    expect(b.matchingExpiresAt!.toMillis()).toBe(NOW + 11 * 60_000 + 60 * 60_000);
    const last = (await db.collection(paths.bookingStatusHistory(id)).orderBy("createdAt", "desc").limit(1).get()).docs[0]!;
    expect(last.data()).toMatchObject({ to: "MATCHING", actor: "SYSTEM", note: "The technician didn't respond in time" });
    // An expired offer can't be accepted late.
    expect((await failure(respondToOffer(deps, "slow", { requestId: req(), bookingId: id, accept: true }))).code).toBe("CONFLICT");
  });

  it("cancels bookings nobody could be matched to in time, with a reason", async () => {
    const id = await newBooking();
    await matchBooking(deps, id);
    clock = NOW + 61 * 60_000;
    expect((await sweepBookings(deps)).cancelled).toBe(1);
    const b = await read(id);
    expect(b.status).toBe(BookingStatus.CANCELLED);
    expect(b.cancellation).toMatchObject({ byUid: null, actor: "SYSTEM", reason: expect.stringMatching(/couldn't find an available technician/) });
  });

  it("gives scheduled jobs until their scheduled time", async () => {
    const at = NOW + 3 * 86_400_000;
    const id = await newBooking({ preferredTime: "SCHEDULED", scheduledAt: new Date(at).toISOString() });
    await matchBooking(deps, id);
    expect((await read(id)).matchingExpiresAt?.toMillis()).toBe(at);
    clock = NOW + 2 * 3_600_000;
    expect((await sweepBookings(deps)).cancelled).toBe(0);
  });

  it("re-searches bookings left without candidates", async () => {
    const id = await newBooking();
    await matchBooking(deps, id);
    await technician("came-online");
    clock = NOW + 6 * 60_000;
    expect((await sweepBookings(deps)).rematched).toBe(1);
    expect((await read(id)).candidates.map((c) => c.technicianId)).toEqual(["came-online"]);
  });

  it("leaves bookings that moved on alone", async () => {
    await technician("t1");
    const id = await newBooking();
    await matchBooking(deps, id);
    await selectTechnician(deps, CUSTOMER, { requestId: req(), bookingId: id, technicianId: "t1" });
    await respondToOffer(deps, "t1", { requestId: req(), bookingId: id, accept: true });
    clock = NOW + 3 * 3_600_000;
    expect(await sweepBookings(deps)).toEqual({ offersExpired: 0, cancelled: 0, rematched: 0 });
    expect((await read(id)).status).toBe("ACCEPTED");
    expect((await db.doc(paths.technician("t1")).get()).get("activeBookingId")).toBe(id);
  });
});
