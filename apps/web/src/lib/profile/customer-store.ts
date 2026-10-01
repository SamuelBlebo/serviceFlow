import { COLLECTIONS, parseDoc, parseDocs, paths, type WithId } from "@serviceflow/firebase";
import {
  type AddressValues,
  type CustomerAddressDoc,
  type CustomerDoc,
  type ServiceAreaDoc,
  type TimestampLike,
  customerAddressDoc,
  customerDoc,
  serviceAreaDoc,
} from "@serviceflow/shared";
import {
  type DocumentSnapshot,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firestore";

/**
 * Customer profile data access. Profiles are self-owned and written directly
 * by the signed-in user; Firestore Security Rules validate every field.
 * Writes resolve only once the server has accepted them.
 */

export type Customer = WithId<CustomerDoc>;
export type Address = WithId<CustomerAddressDoc>;
export type ServiceArea = WithId<ServiceAreaDoc>;

/** Pending serverTimestamp() values read as estimates so local writes still parse. */
const estimated = (s: DocumentSnapshot) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });

export function watchCustomer(uid: string, onData: (c: Customer | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.customer(uid)),
    (snap) => onData(snap.exists() ? parseDoc(customerDoc, estimated(snap)) : null),
    onError,
  );
}

export function watchAddresses(uid: string, onData: (a: Address[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), paths.customerAddresses(uid)), orderBy("createdAt", "asc")),
    (snap) => onData(parseDocs(customerAddressDoc, snap.docs.map(estimated), (id, e) => console.warn(`Invalid address ${id}`, e))),
    onError,
  );
}

/** Active service areas, alphabetical (small catalogue: sorted on the client, no index needed). */
export function watchServiceAreas(onData: (a: ServiceArea[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.serviceAreas), where("isActive", "==", true)),
    (snap) => onData(parseDocs(serviceAreaDoc, snap.docs).sort((a, b) => a.name.localeCompare(b.name))),
    onError,
  );
}

function addressFields(values: AddressValues, area: ServiceArea) {
  return {
    label: values.label,
    directions: values.directions,
    ghanaPostGps: values.ghanaPostGps,
    areaId: area.id,
    areaName: area.name,
    // The area centre for now; a precise device pin is added with booking requests.
    location: { lat: area.center.lat, lng: area.center.lng },
    notes: values.notes,
  };
}

/** First sign-in: profile (+ optional first address, made default) + account display name, atomically. */
export async function createCustomerProfile(
  uid: string,
  fullName: string,
  firstAddress: { values: AddressValues; area: ServiceArea } | null,
): Promise<void> {
  const firestore = db();
  const batch = writeBatch(firestore);
  const addressRef = firstAddress ? doc(collection(firestore, paths.customerAddresses(uid))) : null;
  batch.set(doc(firestore, paths.customer(uid)), {
    fullName,
    defaultAddressId: addressRef?.id ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (firstAddress && addressRef) {
    batch.set(addressRef, { ...addressFields(firstAddress.values, firstAddress.area), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  batch.update(doc(firestore, paths.user(uid)), { displayName: fullName });
  await batch.commit();
}

/** Keeps the customer name and the account display name in step. */
export async function updateCustomerName(uid: string, fullName: string): Promise<void> {
  const firestore = db();
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, paths.customer(uid)), { fullName, updatedAt: serverTimestamp() });
  batch.update(doc(firestore, paths.user(uid)), { displayName: fullName });
  await batch.commit();
}

/** Adds a new address, or updates an existing one (keeping its createdAt). New addresses become default if there is none. */
export async function saveAddress(
  uid: string,
  values: AddressValues,
  area: ServiceArea,
  options: { existing?: { id: string; createdAt: TimestampLike }; makeDefault?: boolean } = {},
): Promise<string> {
  const firestore = db();
  if (options.existing) {
    await setDoc(doc(firestore, paths.customerAddress(uid, options.existing.id)), {
      ...addressFields(values, area),
      createdAt: options.existing.createdAt,
      updatedAt: serverTimestamp(),
    });
    return options.existing.id;
  }
  const batch = writeBatch(firestore);
  const ref = doc(collection(firestore, paths.customerAddresses(uid)));
  batch.set(ref, { ...addressFields(values, area), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (options.makeDefault) {
    batch.update(doc(firestore, paths.customer(uid)), { defaultAddressId: ref.id, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return ref.id;
}

export async function setDefaultAddress(uid: string, addressId: string): Promise<void> {
  const firestore = db();
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, paths.customer(uid)), { defaultAddressId: addressId, updatedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * Deletes an address. If it is the default, the default moves to the most
 * recently added remaining address (or none) in the same batch — the rules
 * refuse to delete the current default otherwise.
 */
export async function deleteAddress(uid: string, addressId: string, customer: Customer, addresses: Address[]): Promise<void> {
  const firestore = db();
  const batch = writeBatch(firestore);
  if (customer.defaultAddressId === addressId) {
    const next = [...addresses].reverse().find((a) => a.id !== addressId);
    batch.update(doc(firestore, paths.customer(uid)), { defaultAddressId: next?.id ?? null, updatedAt: serverTimestamp() });
  }
  batch.delete(doc(firestore, paths.customerAddress(uid, addressId)));
  await batch.commit();
}

/** The operations pages use — injectable so pages are testable without Firebase. */
export const customerStore = { createCustomerProfile, updateCustomerName, saveAddress, setDefaultAddress, deleteAddress };
export type CustomerStore = typeof customerStore;
