import { paths } from "@serviceflow/firebase";
import { AppError, UserStatus, VerificationStatus, technicianDoc, technicianVerificationDoc, walletDoc } from "@serviceflow/shared";
import { FieldValue } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminActionRef } from "../../lib/audit";
import { adminClients, closeAdminClients, resetEmulators } from "../../test/emulator";
import { registerTechnician, submitVerification, updateTechnicianServices, verificationDocId } from "./onboarding";
import { reviewTechnician } from "./review";

const { auth, db, bucket } = adminClients();
const deps = { db, auth, bucket };
const ADMIN = "admin-1";
let n = 0;
const req = () => `req_tech_${++n}_${Date.now()}`;
const uniqueUid = () => `tech-${Date.now()}-${++n}`;

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  return err as AppError;
}

/** An active account (Auth user + users doc), as phone sign-in creates. */
async function account(uid: string, claims: Record<string, true> = {}) {
  await auth.createUser({ uid });
  if (Object.keys(claims).length) await auth.setCustomUserClaims(uid, claims);
  await db.doc(paths.user(uid)).set({
    phone: null,
    email: null,
    displayName: "",
    status: UserStatus.ACTIVE,
    capabilities: { tech: false, admin: Boolean(claims.admin) },
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function catalogue() {
  await db.doc(paths.service("plumbing")).set({ name: "Plumbing", isActive: true });
  await db.doc(paths.service("retired")).set({ name: "Retired", isActive: false });
  await db.doc(paths.serviceArea("osu")).set({ name: "Osu", center: { lat: 5.5558, lng: -0.1793 }, defaultRadiusKm: 8, isActive: true });
  await db.doc(paths.serviceArea("closed")).set({ name: "Closed", center: { lat: 5.6, lng: -0.2 }, defaultRadiusKm: 8, isActive: false });
}

const availability = [
  { day: 3, start: "08:00", end: "17:00" },
  { day: 1, start: "08:00", end: "17:00" },
];

async function upload(path: string, contentType = "image/jpeg", bytes = 2048) {
  await bucket.file(path).save(Buffer.alloc(bytes, 1), { contentType });
}

async function readyToSubmit(uid: string) {
  await account(uid);
  await registerTechnician(deps, uid, { displayName: "Kwame Owusu", yearsExperience: 5 });
  await updateTechnicianServices(deps, uid, { serviceIds: ["plumbing"], areaIds: ["osu"], weeklyAvailability: availability });
}

async function submit(uid: string, submissionId = `s${++n}`) {
  const folder = `verifications/${uid}/${submissionId}`;
  await upload(`${folder}/id.jpg`);
  await upload(`${folder}/selfie.jpg`);
  return submitVerification(deps, uid, {
    submissionId,
    idType: "GHANA_CARD",
    idNumber: "GHA-123456789-0",
    idPhotoPath: `${folder}/id.jpg`,
    selfiePath: `${folder}/selfie.jpg`,
  });
}

const status = async (uid: string) => (await db.doc(paths.technician(uid)).get()).get("verificationStatus");

beforeEach(async () => {
  await resetEmulators();
  await catalogue();
});
afterAll(closeAdminClients);

describe("registerTechnician", () => {
  it("creates an UNSUBMITTED profile and an empty wallet, and grants the tech claim", async () => {
    const uid = uniqueUid();
    await account(uid);
    await registerTechnician(deps, uid, { displayName: "Kwame Owusu", yearsExperience: 5 });

    const technician = (await db.doc(paths.technician(uid)).get()).data();
    expect(technicianDoc.safeParse(technician).success).toBe(true);
    expect(technician).toMatchObject({ verificationStatus: "UNSUBMITTED", isOnline: false, serviceIds: [], searchKeywords: ["kwame", "owusu"] });
    expect(walletDoc.safeParse((await db.doc(paths.wallet(uid)).get()).data()).success).toBe(true);
    expect((await auth.getUser(uid)).customClaims).toEqual({ tech: true });
    expect((await db.doc(paths.user(uid)).get()).get("capabilities.tech")).toBe(true);
  });

  it("keeps existing claims (an admin who also becomes a provider stays admin)", async () => {
    const uid = uniqueUid();
    await account(uid, { admin: true });
    await registerTechnician(deps, uid, { displayName: "Ama Admin", yearsExperience: 0 });
    expect((await auth.getUser(uid)).customClaims).toEqual({ admin: true, tech: true });
  });

  it("is safe to repeat", async () => {
    const uid = uniqueUid();
    await account(uid);
    await registerTechnician(deps, uid, { displayName: "Kwame Owusu", yearsExperience: 5 });
    await expect(registerTechnician(deps, uid, { displayName: "Changed Name", yearsExperience: 9 })).resolves.toMatchObject({ ok: true });
    expect((await db.doc(paths.technician(uid)).get()).get("displayName")).toBe("Kwame Owusu");
  });
});

describe("updateTechnicianServices", () => {
  it("copies area coordinates from the catalogue and sorts availability", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    const technician = (await db.doc(paths.technician(uid)).get()).data();
    expect(technician?.serviceAreas).toEqual([{ areaId: "osu", name: "Osu", lat: 5.5558, lng: -0.1793, radiusKm: 8 }]);
    expect(technician?.weeklyAvailability.map((w: { day: number }) => w.day)).toEqual([1, 3]);
  });

  it("refuses inactive or unknown services and areas", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    const base = { serviceIds: ["plumbing"], areaIds: ["osu"], weeklyAvailability: availability };
    expect((await failure(updateTechnicianServices(deps, uid, { ...base, serviceIds: ["retired"] }))).message).toMatch(/not a service/);
    expect((await failure(updateTechnicianServices(deps, uid, { ...base, serviceIds: ["ghost"] }))).code).toBe("VALIDATION_ERROR");
    expect((await failure(updateTechnicianServices(deps, uid, { ...base, areaIds: ["closed"] }))).message).toMatch(/not an area/);
  });

  it("requires registration first", async () => {
    const uid = uniqueUid();
    await account(uid);
    const err = await failure(updateTechnicianServices(deps, uid, { serviceIds: ["plumbing"], areaIds: ["osu"], weeklyAvailability: availability }));
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("submitVerification", () => {
  it("records a PENDING submission when both photos really exist", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    const { id } = await submit(uid, "first");
    expect(id).toBe(verificationDocId(uid, "first"));

    const verification = (await db.doc(paths.technicianVerification(id)).get()).data();
    expect(technicianVerificationDoc.safeParse(verification).success).toBe(true);
    expect(verification).toMatchObject({ technicianId: uid, status: "PENDING", idNumber: "GHA-123456789-0" });
    expect((await db.doc(paths.technician(uid)).get()).data()).toMatchObject({ verificationStatus: "PENDING", latestVerificationId: id });
  });

  it("refuses missing, misplaced, non-image or duplicate pictures", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    const folder = `verifications/${uid}/s1`;
    const base = { submissionId: "s1", idType: "GHANA_CARD", idNumber: "GHA-123456789-0", idPhotoPath: `${folder}/id.jpg`, selfiePath: `${folder}/selfie.jpg` };

    expect((await failure(submitVerification(deps, uid, base))).message).toMatch(/couldn't find your ID photo/);

    await upload(`verifications/someone-else/s1/id.jpg`);
    expect((await failure(submitVerification(deps, uid, { ...base, idPhotoPath: "verifications/someone-else/s1/id.jpg" }))).message).toMatch(/own verification folder/);

    await upload(`${folder}/id.jpg`, "application/pdf");
    await upload(`${folder}/selfie.jpg`);
    expect((await failure(submitVerification(deps, uid, base))).message).toMatch(/must be a photo/);

    expect((await failure(submitVerification(deps, uid, { ...base, selfiePath: base.idPhotoPath }))).message).toMatch(/different pictures/);
  });

  it("requires services and areas to be chosen first", async () => {
    const uid = uniqueUid();
    await account(uid);
    await registerTechnician(deps, uid, { displayName: "Kwame Owusu", yearsExperience: 5 });
    expect((await failure(submit(uid))).message).toMatch(/services and areas/);
  });

  it("is idempotent for the same submission, but refuses a second while one is pending", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    await submit(uid, "same");
    await expect(submit(uid, "same")).resolves.toMatchObject({ ok: true });
    expect((await failure(submit(uid, "another"))).message).toMatch(/already being reviewed/);
  });
});

describe("reviewTechnician (admin)", () => {
  it("approves a pending submission: technician VERIFIED, review recorded, audited", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    const { id } = await submit(uid);
    const requestId = req();
    await reviewTechnician({ db }, ADMIN, { requestId, technicianId: uid, decision: "APPROVE" });

    expect(await status(uid)).toBe(VerificationStatus.VERIFIED);
    expect((await db.doc(paths.technicianVerification(id)).get()).data()).toMatchObject({ status: "VERIFIED", reviewedBy: ADMIN });
    expect((await adminActionRef(db, ADMIN, requestId).get()).data()).toMatchObject({
      actionType: "TECHNICIAN_VERIFIED",
      before: { verificationStatus: "PENDING" },
      after: { verificationStatus: "VERIFIED", verificationId: id },
    });
  });

  it("rejects with a reason, and the technician can resubmit", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    const { id } = await submit(uid);
    await reviewTechnician({ db }, ADMIN, { requestId: req(), technicianId: uid, decision: "REJECT", notes: "ID photo is blurry" });
    expect(await status(uid)).toBe("REJECTED");
    expect((await db.doc(paths.technicianVerification(id)).get()).get("reviewNotes")).toBe("ID photo is blurry");

    await submit(uid);
    expect(await status(uid)).toBe("PENDING");
  });

  it("suspends a verified technician (forcing them offline) and reinstates them", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    await submit(uid);
    await reviewTechnician({ db }, ADMIN, { requestId: req(), technicianId: uid, decision: "APPROVE" });
    await db.doc(paths.technician(uid)).update({ isOnline: true });

    await reviewTechnician({ db }, ADMIN, { requestId: req(), technicianId: uid, decision: "SUSPEND", notes: "Customer safety complaint" });
    expect((await db.doc(paths.technician(uid)).get()).data()).toMatchObject({ verificationStatus: "SUSPENDED", isOnline: false });

    // Legacy D-9: a suspended technician cannot resubmit their way back to PENDING.
    expect((await failure(submit(uid))).message).toMatch(/suspended/);

    await reviewTechnician({ db }, ADMIN, { requestId: req(), technicianId: uid, decision: "REINSTATE" });
    expect(await status(uid)).toBe("VERIFIED");
  });

  it("refuses invalid transitions, unknown technicians and self-review", async () => {
    const uid = uniqueUid();
    await readyToSubmit(uid);
    expect((await failure(reviewTechnician({ db }, ADMIN, { requestId: req(), technicianId: uid, decision: "APPROVE" }))).code).toBe(
      "INVALID_STATE_TRANSITION",
    );
    expect((await failure(reviewTechnician({ db }, ADMIN, { requestId: req(), technicianId: "ghost", decision: "APPROVE" }))).code).toBe("NOT_FOUND");
    expect((await failure(reviewTechnician({ db }, uid, { requestId: req(), technicianId: uid, decision: "APPROVE" }))).code).toBe("FORBIDDEN");
  });
});
