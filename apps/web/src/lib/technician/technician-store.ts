import { COLLECTIONS, parseDoc, parseDocs, paths, storagePaths, type WithId } from "@serviceflow/firebase";
import {
  type RegisterTechnicianInput,
  type ReviewTechnicianInput,
  type SubmitVerificationInput,
  type TechnicianDoc,
  type TechnicianVerificationDoc,
  type UpdateTechnicianServicesInput,
  VerificationStatus,
  technicianDoc,
  technicianVerificationDoc,
} from "@serviceflow/shared";
import { type DocumentSnapshot, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { compressImage } from "../images";
import { db } from "../firebase/firestore";
import { call } from "../firebase/functions";
import { storage } from "../firebase/storage";

export type Technician = WithId<TechnicianDoc>;
export type Verification = WithId<TechnicianVerificationDoc>;

const estimated = (s: DocumentSnapshot) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

export function watchTechnician(uid: string, onData: (t: Technician | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.technician(uid)),
    (snap) => onData(snap.exists() ? parseDoc(technicianDoc, estimated(snap)) : null),
    onError,
  );
}

/** The technician's own submissions, newest first (rules: owner and admins only). */
export function watchMyVerifications(uid: string, onData: (v: Verification[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.technicianVerifications), where("technicianId", "==", uid), orderBy("submittedAt", "desc"), limit(10)),
    (snap) => onData(parseDocs(technicianVerificationDoc, snap.docs.map(estimated))),
    onError,
  );
}

/** Admin: technicians in a given verification state. */
export function watchTechniciansByStatus(
  status: VerificationStatus | "ALL",
  onData: (t: Technician[]) => void,
  onError: (e: Error) => void,
): () => void {
  const base = collection(db(), COLLECTIONS.technicians);
  const q = status === "ALL" ? query(base, orderBy("createdAt", "desc"), limit(200)) : query(base, where("verificationStatus", "==", status), limit(200));
  return onSnapshot(q, (snap) => onData(parseDocs(technicianDoc, snap.docs.map(estimated))), onError);
}

export function watchVerification(id: string, onData: (v: Verification | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.technicianVerification(id)),
    (snap) => onData(snap.exists() ? parseDoc(technicianVerificationDoc, estimated(snap)) : null),
    onError,
  );
}

/** Signed URL for a private document (rules: owner or admin). */
export function documentUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage(), path));
}

async function uploadImage(path: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  await uploadBytes(ref(storage(), path), blob, { contentType: blob.type || "image/jpeg" });
  return path;
}

export const technicianStore = {
  register: (input: RegisterTechnicianInput) => call("registerTechnician", input),
  updateServices: (input: UpdateTechnicianServicesInput) => call("updateTechnicianServices", input),

  /** Uploads both documents into a fresh private folder, then submits them for review. */
  async submitVerification(
    uid: string,
    input: { requestId: string; submissionId: string; idType: SubmitVerificationInput["idType"]; idNumber: string; idPhoto: File; selfie: File },
  ) {
    const idPhotoPath = await uploadImage(storagePaths.verificationDocument(uid, input.submissionId, "id.jpg"), input.idPhoto);
    const selfiePath = await uploadImage(storagePaths.verificationDocument(uid, input.submissionId, "selfie.jpg"), input.selfie);
    return call("submitVerification", {
      requestId: input.requestId,
      submissionId: input.submissionId,
      idType: input.idType,
      idNumber: input.idNumber,
      idPhotoPath,
      selfiePath,
    });
  },

  /** Direct, rules-validated edits to the technician's own public profile. */
  async updateProfile(uid: string, fields: { bio: string; yearsExperience: number; photo?: File | null }) {
    const photoPath = fields.photo ? await uploadImage(storagePaths.technicianProfilePhoto(uid, "photo.jpg"), fields.photo) : undefined;
    await updateDoc(doc(db(), paths.technician(uid)), {
      bio: fields.bio,
      yearsExperience: fields.yearsExperience,
      ...(photoPath ? { photoPath } : {}),
      updatedAt: serverTimestamp(),
    });
  },

  /** Online only when VERIFIED (rules enforce it); going offline is always allowed. */
  setOnline: (uid: string, isOnline: boolean) => updateDoc(doc(db(), paths.technician(uid)), { isOnline, updatedAt: serverTimestamp() }),

  review: (input: ReviewTechnicianInput) => call("reviewTechnician", input),
};
export type TechnicianStore = typeof technicianStore;
