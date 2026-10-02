import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "@react-native-firebase/firestore";
import { putFile, ref } from "@react-native-firebase/storage";
import { COLLECTIONS, parseDoc, parseDocs, paths, storagePaths, type WithId } from "@serviceflow/firebase";
import {
  type IdDocumentType,
  type RegisterTechnicianInput,
  type ServiceAreaDoc,
  type TechnicianDoc,
  type TechnicianVerificationDoc,
  type UpdateTechnicianServicesInput,
  serviceAreaDoc,
  technicianDoc,
  technicianVerificationDoc,
} from "@serviceflow/shared";
import { call } from "../lib/call";
import { db, storage } from "../lib/firebase";
import { compressPhoto } from "./photos";

export type Technician = WithId<TechnicianDoc>;
export type Verification = WithId<TechnicianVerificationDoc>;
export type ServiceArea = WithId<ServiceAreaDoc>;

type Snap = { id: string; data(options?: { serverTimestamps?: "estimate" }): unknown };
// Pending server timestamps read as estimates, so local writes still parse.
const estimated = (s: Snap) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

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
    query(
      collection(db(), COLLECTIONS.technicianVerifications),
      where("technicianId", "==", uid),
      orderBy("submittedAt", "desc"),
      limit(10),
    ),
    (snap) => onData(parseDocs(technicianVerificationDoc, snap.docs.map(estimated))),
    onError,
  );
}

export function watchServiceAreas(onData: (a: ServiceArea[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.serviceAreas), where("isActive", "==", true)),
    (snap) => onData(parseDocs(serviceAreaDoc, snap.docs).sort((a, b) => a.name.localeCompare(b.name))),
    onError,
  );
}

/** Compresses a local photo, then uploads it from disk (no base64 copy in JS memory). */
async function uploadPhoto(path: string, localUri: string): Promise<string> {
  const compressed = await compressPhoto(localUri);
  await putFile(ref(storage(), path), compressed, { contentType: "image/jpeg" });
  return path;
}

export const technicianStore = {
  register: (input: RegisterTechnicianInput) => call("registerTechnician", input),
  updateServices: (input: UpdateTechnicianServicesInput) => call("updateTechnicianServices", input),

  /** Uploads both photos into a fresh private folder, then submits them for review. */
  async submitVerification(
    uid: string,
    input: { requestId: string; submissionId: string; idType: IdDocumentType; idNumber: string; idPhotoUri: string; selfieUri: string },
  ) {
    const idPhotoPath = await uploadPhoto(storagePaths.verificationDocument(uid, input.submissionId, "id.jpg"), input.idPhotoUri);
    const selfiePath = await uploadPhoto(storagePaths.verificationDocument(uid, input.submissionId, "selfie.jpg"), input.selfieUri);
    return call("submitVerification", {
      requestId: input.requestId,
      submissionId: input.submissionId,
      idType: input.idType,
      idNumber: input.idNumber,
      idPhotoPath,
      selfiePath,
    });
  },

  /** Online only when VERIFIED (rules enforce it); going offline is always allowed. */
  setOnline: (uid: string, isOnline: boolean) =>
    updateDoc(doc(db(), paths.technician(uid)), { isOnline, updatedAt: serverTimestamp() }),
};
export type TechnicianStore = typeof technicianStore;
