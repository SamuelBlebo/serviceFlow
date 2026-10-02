import { createHash } from "node:crypto";
import { paths } from "@serviceflow/firebase";
import { ConflictError, JOB_LIMITS, ValidationError, canAddJobPhoto } from "@serviceflow/shared";
import { FieldValue } from "firebase-admin/firestore";
import { type BookingDeps, assertAssignedTechnician, readBooking, writeReceipt } from "./common";

interface Bucket {
  file(path: string): { getMetadata(): Promise<[{ contentType?: string; size?: string | number }, ...unknown[]]> };
}

/**
 * `bookings-addJobPhoto`: records a before/after photo the assigned
 * technician uploaded (Storage rules let only them write to
 * `bookings/{id}/{kind}/`). The server checks the file really exists, is an
 * image within the limit and sits in that booking's folder, then creates
 * the media document. Idempotent per file and per request.
 */
export async function addJobPhoto(
  deps: BookingDeps & { bucket: Bucket },
  uid: string,
  input: { requestId: string; bookingId: string; kind: "BEFORE" | "AFTER"; storagePath: string },
): Promise<{ ok: true; id: string }> {
  const { db, bucket } = deps;
  const prefix = `bookings/${input.bookingId}/${input.kind}/`;
  if (!input.storagePath.startsWith(prefix) || input.storagePath.slice(prefix.length).includes("/") || input.storagePath.length === prefix.length) {
    throw new ValidationError("That photo isn't in this job's folder.");
  }
  let meta: { contentType?: string; size?: string | number };
  try {
    [meta] = await bucket.file(input.storagePath).getMetadata();
  } catch {
    throw new ValidationError("We couldn't find the photo. Please upload it again.");
  }
  if (!meta.contentType?.startsWith("image/")) throw new ValidationError("Only photos can be added to a job.");
  const sizeBytes = Number(meta.size ?? 0);
  if (sizeBytes <= 0 || sizeBytes > JOB_LIMITS.maxPhotoBytes) throw new ValidationError("That photo is too large.");

  const mediaId = createHash("sha256").update(input.storagePath).digest("hex").slice(0, 20);
  await db.runTransaction(async (tx) => {
    const { booking, receipt, done } = await readBooking(tx, db, input.bookingId, uid, input.requestId);
    const mediaRef = db.collection(paths.bookingMedia(input.bookingId)).doc(mediaId);
    const [existing, all] = await Promise.all([tx.get(mediaRef), tx.get(db.collection(paths.bookingMedia(input.bookingId)).limit(JOB_LIMITS.maxPhotos))]);
    if (done || existing.exists) return;
    assertAssignedTechnician(booking, uid);
    if (!canAddJobPhoto(booking.status, input.kind)) {
      throw new ConflictError(input.kind === "BEFORE" ? "Add before photos once you've arrived." : "Add after photos once you've started the work.");
    }
    if (all.size >= JOB_LIMITS.maxPhotos) throw new ConflictError(`A job can have at most ${JOB_LIMITS.maxPhotos} photos.`);
    tx.create(mediaRef, {
      kind: input.kind,
      storagePath: input.storagePath,
      contentType: meta.contentType,
      sizeBytes,
      uploadedBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    writeReceipt(tx, receipt, "addJobPhoto");
  });
  return { ok: true, id: mediaId };
}
