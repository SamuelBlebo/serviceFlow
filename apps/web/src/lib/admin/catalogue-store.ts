import { COLLECTIONS, parseDoc, parseDocs, paths, type WithId } from "@serviceflow/firebase";
import { type ServiceDoc, type SetServiceActiveInput, type UpsertServiceInput, serviceDoc } from "@serviceflow/shared";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { call } from "../firebase/functions";

export type Service = WithId<ServiceDoc>;

/** Admin view: every service, including hidden ones (rules allow admins to read all). */
export function watchAllServices(onData: (s: Service[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db(), COLLECTIONS.services),
    (snap) => onData(sortServices(parseDocs(serviceDoc, snap.docs, (id, e) => console.warn(`Invalid service ${id}`, e)))),
    onError,
  );
}

/** Public view: active services only (the query must filter, or the rules refuse it). */
export function watchActiveServices(onData: (s: Service[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.services), where("isActive", "==", true)),
    (snap) => onData(sortServices(parseDocs(serviceDoc, snap.docs))),
    onError,
  );
}

/**
 * One public service by slug. Hidden services are unreadable for the public
 * (rules), which surfaces as a permission error — reported as "not found".
 */
export function watchPublicService(slug: string, onData: (s: Service | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.service(slug)),
    (snap) => onData(snap.exists() ? parseDoc(serviceDoc, snap) : null),
    (error) => ((error as { code?: string }).code === "permission-denied" ? onData(null) : onError(error)),
  );
}

export function sortServices(services: Service[]): Service[] {
  return [...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export const catalogueStore = {
  upsertService: (input: UpsertServiceInput) => call("upsertService", input),
  setServiceActive: (input: SetServiceActiveInput) => call("setServiceActive", input),
};
export type CatalogueStore = typeof catalogueStore;
