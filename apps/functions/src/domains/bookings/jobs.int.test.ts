import { paths } from "@serviceflow/firebase";
import { AppError, BookingStatus, UserStatus, bookingDoc, bookingMediaDoc } from "@serviceflow/shared";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { createBooking } from "./create";
import { advanceJob, respondToOffer } from "./lifecycle";
import { addJobPhoto } from "./media";
import { respondToQuote, submitQuote } from "./pricing";

/** The technician's on-the-job steps (Stage 9): location at en route, photos, completion notes. */
const { db, bucket } = adminClients();
const NOW = Date.UTC(2026, 9, 2, 9, 0);
const deps = { db, bucket, now: () => NOW };
const CUSTOMER = "cust-1";
const TECH = "tech-1";
let n = 0;
const req = () => `req_job_${++n}_${Date.now()}`;

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  return err as AppError;
}

async function upload(path: string, contentType = "image/jpeg", bytes = 2048) {
  await bucket.file(path).save(Buffer.alloc(bytes, 1), { contentType });
}

async function acceptedJob() {
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
  const { id } = await createBooking(deps, CUSTOMER, { requestId: req(), serviceId: "plumbing", problemDescription: "Kitchen sink pipe is leaking", addressId: "home", preferredTime: "ASAP" }, "MOBILE");
  await db.doc(paths.booking(id)).update({ status: "OFFERED", offeredTechnicianId: TECH, participantIds: FieldValue.arrayUnion(TECH), offerExpiresAt: Timestamp.fromMillis(NOW + 600_000) });
  await respondToOffer(deps, TECH, { requestId: req(), bookingId: id, accept: true });
  return id;
}

const read = async (id: string) => bookingDoc.parse((await db.doc(paths.booking(id)).get()).data());
const photo = (id: string, kind: "BEFORE" | "AFTER", file = `${++n}.jpg`) => `bookings/${id}/${kind}/${file}`;

beforeEach(async () => {
  await resetEmulators();
});

afterAll(async () => {
  await closeAdminClients();
});

describe("technician job steps", () => {
  it("records the location once when setting off, and the notes when finishing", async () => {
    const id = await acceptedJob();
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE, location: { lat: 5.6, lng: -0.19 } });
    expect((await read(id)).enRouteLocation).toEqual({ lat: 5.6, lng: -0.19 });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED, location: { lat: 1, lng: 1 } });
    expect((await read(id)).enRouteLocation).toEqual({ lat: 5.6, lng: -0.19 }); // not tracked after en route
    await submitQuote(deps, TECH, { requestId: req(), bookingId: id, amountMinor: 20000 });
    await respondToQuote(deps, CUSTOMER, { requestId: req(), bookingId: id, accept: true });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.IN_PROGRESS });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.COMPLETED, notes: "Replaced the trap and resealed" });
    expect((await read(id)).completionNotes).toBe("Replaced the trap and resealed");
  });
});

describe("bookings-addJobPhoto", () => {
  async function onSite() {
    const id = await acceptedJob();
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.EN_ROUTE });
    await advanceJob(deps, TECH, { requestId: req(), bookingId: id, to: BookingStatus.ARRIVED });
    return id;
  }

  it("records an uploaded before photo, once per file", async () => {
    const id = await onSite();
    const path = photo(id, "BEFORE");
    await upload(path);
    const first = await addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: path });
    const again = await addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: path });
    expect(again.id).toBe(first.id);
    const media = await db.collection(paths.bookingMedia(id)).get();
    expect(media.size).toBe(1);
    expect(bookingMediaDoc.parse(media.docs[0]!.data())).toMatchObject({ kind: "BEFORE", storagePath: path, contentType: "image/jpeg", sizeBytes: 2048, uploadedBy: TECH });
  });

  it("checks the folder, the file, the stage and who is asking", async () => {
    const id = await onSite();
    expect((await failure(addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: `bookings/other/BEFORE/x.jpg` }))).message).toMatch(/folder/);
    expect((await failure(addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: photo(id, "AFTER") }))).message).toMatch(/folder/);
    expect((await failure(addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: photo(id, "BEFORE", "missing.jpg") }))).message).toMatch(/couldn't find/);
    const pdf = photo(id, "BEFORE", "doc.pdf");
    await upload(pdf, "application/pdf");
    expect((await failure(addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: pdf }))).message).toMatch(/Only photos/);
    const after = photo(id, "AFTER");
    await upload(after);
    expect((await failure(addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "AFTER", storagePath: after }))).message).toMatch(/started the work/);
    const ok = photo(id, "BEFORE");
    await upload(ok);
    expect((await failure(addJobPhoto(deps, "someone-else", { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: ok }))).code).toBe("FORBIDDEN");
  });

  it("caps photos per job", async () => {
    const id = await onSite();
    for (let i = 0; i < 10; i++) {
      const p = photo(id, "BEFORE");
      await upload(p);
      await addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: p });
    }
    const extra = photo(id, "BEFORE");
    await upload(extra);
    expect((await failure(addJobPhoto(deps, TECH, { requestId: req(), bookingId: id, kind: "BEFORE", storagePath: extra }))).message).toMatch(/at most 10/);
  });
});
