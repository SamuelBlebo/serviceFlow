import { paths } from "@serviceflow/firebase";
import {
  ConflictError,
  DEFAULT_WEEKLY_AVAILABILITY,
  NotFoundError,
  TECHNICIAN_LIMITS,
  type UpdateTechnicianServicesInput,
  ValidationError,
  VerificationStatus,
  canSubmitVerification,
} from "@serviceflow/shared";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * Technician onboarding (plan §4.4–4.5, §12.3). Everything that affects who
 * can be matched to customers runs here, server-side: the `tech` claim,
 * services, coverage areas, availability and identity documents.
 */

interface Bucket {
  file(path: string): { getMetadata(): Promise<[{ contentType?: string; size?: string | number }, ...unknown[]]> };
}

export interface OnboardingDeps {
  db: Firestore;
  auth: Auth;
  bucket?: Bucket;
}

const emptyStats = { ratingSum: 0, ratingCount: 0, avgRating: 0, completed: 0, cancelled: 0, offered: 0, responded: 0 };

const keywords = (name: string) => [...new Set(name.toLowerCase().split(/\s+/).filter(Boolean))];

/**
 * Registers the caller as a service provider: technician profile (UNSUBMITTED),
 * empty wallet and the `tech` custom claim. Safe to repeat — a second call
 * just makes sure the claim is set (e.g. if the first call failed after the
 * Firestore write).
 */
export async function registerTechnician(
  deps: OnboardingDeps,
  uid: string,
  input: { displayName: string; yearsExperience: number },
): Promise<{ ok: true; id: string }> {
  const { db } = deps;
  const technicianRef = db.doc(paths.technician(uid));
  const walletRef = db.doc(paths.wallet(uid));
  const userRef = db.doc(paths.user(uid));

  await db.runTransaction(async (tx) => {
    const [technician, wallet, user] = await Promise.all([tx.get(technicianRef), tx.get(walletRef), tx.get(userRef)]);
    if (!user.exists) throw new NotFoundError("Account", uid);
    if (technician.exists) return; // already registered

    tx.create(technicianRef, {
      displayName: input.displayName,
      photoPath: null,
      bio: "",
      yearsExperience: input.yearsExperience,
      serviceIds: [],
      serviceAreas: [],
      weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
      isOnline: false,
      verificationStatus: VerificationStatus.UNSUBMITTED,
      latestVerificationId: null,
      stats: emptyStats,
      activeBookingId: null,
      searchKeywords: keywords(input.displayName),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!wallet.exists) {
      tx.create(walletRef, {
        availableMinor: 0,
        pendingPayoutMinor: 0,
        lifetimeEarningsMinor: 0,
        currency: "GHS",
        lastEntryId: null,
        entryCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(userRef, {
      "capabilities.tech": true,
      ...(user.get("displayName") ? {} : { displayName: input.displayName }),
      claimsUpdatedAt: FieldValue.serverTimestamp(),
    });
  });

  // Keep any existing claims (e.g. admin) and add `tech`. Idempotent.
  const existing = (await deps.auth.getUser(uid)).customClaims ?? {};
  if (existing.tech !== true) await deps.auth.setCustomUserClaims(uid, { ...existing, tech: true });
  return { ok: true, id: uid };
}

/**
 * Services, coverage areas and weekly availability. Areas come from the
 * catalogue: the server copies name, centre and radius so a client can't
 * claim coverage anywhere it likes. Only active services/areas are allowed.
 */
export async function updateTechnicianServices(
  deps: OnboardingDeps,
  uid: string,
  input: Omit<UpdateTechnicianServicesInput, "requestId">,
): Promise<{ ok: true; id: string }> {
  const { db } = deps;
  const technicianRef = db.doc(paths.technician(uid));

  await db.runTransaction(async (tx) => {
    const technician = await tx.get(technicianRef);
    if (!technician.exists) throw new NotFoundError("Technician profile — register as a provider first", uid);

    const services = await tx.getAll(...input.serviceIds.map((id) => db.doc(paths.service(id))));
    const missingService = services.find((s) => !s.exists || s.get("isActive") !== true);
    if (missingService) throw new ValidationError(`"${missingService.id}" is not a service customers can book right now.`);

    const areas = await tx.getAll(...input.areaIds.map((id) => db.doc(paths.serviceArea(id))));
    const missingArea = areas.find((a) => !a.exists || a.get("isActive") !== true);
    if (missingArea) throw new ValidationError(`"${missingArea.id}" is not an area we currently serve.`);

    tx.update(technicianRef, {
      serviceIds: input.serviceIds,
      serviceAreas: areas.map((a) => ({
        areaId: a.id,
        name: a.get("name") as string,
        lat: a.get("center.lat") as number,
        lng: a.get("center.lng") as number,
        radiusKm: a.get("defaultRadiusKm") as number,
      })),
      weeklyAvailability: [...input.weeklyAvailability].sort((x, y) => x.day - y.day || x.start.localeCompare(y.start)),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, id: uid };
}

export interface VerificationSubmission {
  submissionId: string;
  idType: string;
  idNumber: string;
  idPhotoPath: string;
  selfiePath: string;
}

export const verificationDocId = (uid: string, submissionId: string) => `${uid}_${submissionId}`;

async function assertUploadedImage(bucket: Bucket, path: string, what: string): Promise<void> {
  let meta: { contentType?: string; size?: string | number };
  try {
    [meta] = await bucket.file(path).getMetadata();
  } catch {
    throw new ValidationError(`We couldn't find your ${what}. Please upload it again.`);
  }
  if (!meta.contentType?.startsWith("image/")) throw new ValidationError(`Your ${what} must be a photo.`);
  if (Number(meta.size ?? 0) > TECHNICIAN_LIMITS.maxImageBytes) throw new ValidationError(`Your ${what} is too large.`);
}

/**
 * Submits identity documents for review. Allowed only from UNSUBMITTED or
 * REJECTED (fixes legacy D-9). Images must be in the technician's private
 * folder for this submission and must really exist.
 */
export async function submitVerification(
  deps: OnboardingDeps,
  uid: string,
  input: VerificationSubmission,
): Promise<{ ok: true; id: string }> {
  const { db } = deps;
  if (!deps.bucket) throw new Error("Storage bucket not configured");

  const folder = `verifications/${uid}/${input.submissionId}/`;
  for (const [path, what] of [
    [input.idPhotoPath, "ID photo"],
    [input.selfiePath, "selfie"],
  ] as const) {
    if (!path.startsWith(folder) || path.slice(folder.length).includes("/")) {
      throw new ValidationError(`Your ${what} must be uploaded to your own verification folder.`);
    }
  }
  if (input.idPhotoPath === input.selfiePath) throw new ValidationError("Your ID photo and selfie must be different pictures.");
  await assertUploadedImage(deps.bucket, input.idPhotoPath, "ID photo");
  await assertUploadedImage(deps.bucket, input.selfiePath, "selfie");

  const technicianRef = db.doc(paths.technician(uid));
  const id = verificationDocId(uid, input.submissionId);
  const verificationRef = db.doc(paths.technicianVerification(id));

  await db.runTransaction(async (tx) => {
    const [technician, existing] = await Promise.all([tx.get(technicianRef), tx.get(verificationRef)]);
    if (!technician.exists) throw new NotFoundError("Technician profile — register as a provider first", uid);
    if (existing.exists) return; // retry of this submission

    const status = technician.get("verificationStatus") as VerificationStatus;
    if (!canSubmitVerification(status)) {
      const reason: Partial<Record<VerificationStatus, string>> = {
        PENDING: "Your documents are already being reviewed.",
        VERIFIED: "You're already verified.",
        SUSPENDED: "Your provider account is suspended. Contact ServiceFlow support.",
      };
      throw new ConflictError(reason[status] ?? "You can't submit documents right now.");
    }
    if ((technician.get("serviceIds") as string[]).length === 0 || (technician.get("serviceAreas") as unknown[]).length === 0) {
      throw new ValidationError("Choose your services and areas before submitting documents.");
    }

    tx.create(verificationRef, {
      technicianId: uid,
      idType: input.idType,
      idNumber: input.idNumber,
      idPhotoPath: input.idPhotoPath,
      selfiePath: input.selfiePath,
      status: VerificationStatus.PENDING,
      reviewNotes: null,
      reviewedBy: null,
      submittedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
    });
    tx.update(technicianRef, {
      verificationStatus: VerificationStatus.PENDING,
      latestVerificationId: id,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, id };
}
