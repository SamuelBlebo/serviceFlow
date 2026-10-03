import { COLLECTIONS, parseDoc, parseDocs, paths, type WithId } from "@serviceflow/firebase";
import {
  ACTIVE_JOB_STATUSES,
  BookingStatus,
  type CommissionRuleDoc,
  type CreateCommissionRuleInput,
  type CustomerAddressDoc,
  type CustomerDoc,
  type PlatformSettingsDoc,
  type ServiceAreaDoc,
  type SetCommissionRuleActiveInput,
  type SetServiceAreaActiveInput,
  type SetUserStatusInput,
  type UpdatePlatformSettingsInput,
  type UpsertServiceAreaInput,
  type UserDoc,
  VerificationStatus,
  bookingDoc,
  commissionRuleDoc,
  customerAddressDoc,
  customerDoc,
  platformSettingsDoc,
  serviceAreaDoc,
  userDoc,
} from "@serviceflow/shared";
import { type DocumentSnapshot, collection, doc, getCountFromServer, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import type { Booking } from "../bookings/booking-store";
import { db } from "../firebase/firestore";
import { call } from "../firebase/functions";

/**
 * Admin dashboards (Stage 10). Admins read operational data directly (rules:
 * admin claim); every change goes through an audited callable.
 */

export type Customer = WithId<CustomerDoc>;
export type Account = WithId<UserDoc>;
export type CustomerAddress = WithId<CustomerAddressDoc>;
export type CommissionRule = WithId<CommissionRuleDoc>;
export type Area = WithId<ServiceAreaDoc>;
export interface AuditEntry {
  id: string;
  adminUid: string;
  actionType: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAtMs: number;
}

type Unsub = () => void;
type OnError = (e: Error) => void;
const estimated = (s: DocumentSnapshot) => ({ id: s.id, data: () => s.data({ serverTimestamps: "estimate" }) });
const warn = (what: string) => (id: string, e: unknown) => console.warn(`Skipping invalid ${what} ${id}`, e);

export interface Kpis {
  bookingsToday: number;
  waiting: number;
  activeJobs: number;
  techniciansOnline: number;
  pendingVerifications: number;
}

/** Headline numbers (count queries — cheap, not live; the page refreshes them). */
export async function loadKpis(now = new Date()): Promise<Kpis> {
  const bookings = collection(db(), COLLECTIONS.bookings);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const count = async (q: Parameters<typeof getCountFromServer>[0]) => (await getCountFromServer(q)).data().count;
  const [bookingsToday, waiting, activeJobs, techniciansOnline, pendingVerifications] = await Promise.all([
    count(query(bookings, where("createdAt", ">=", Timestamp.fromDate(startOfDay)))),
    count(query(bookings, where("status", "in", [BookingStatus.REQUESTED, BookingStatus.MATCHING, BookingStatus.OFFERED]))),
    count(query(bookings, where("status", "in", [...ACTIVE_JOB_STATUSES]))),
    count(query(collection(db(), COLLECTIONS.technicians), where("verificationStatus", "==", VerificationStatus.VERIFIED), where("isOnline", "==", true))),
    count(query(collection(db(), COLLECTIONS.technicians), where("verificationStatus", "==", VerificationStatus.PENDING))),
  ]);
  return { bookingsToday, waiting, activeJobs, techniciansOnline, pendingVerifications };
}

/** Live monitor: bookings waiting for a technician or with one at work. */
export function watchLiveBookings(onData: (b: Booking[]) => void, onError: OnError): Unsub {
  const live = [BookingStatus.REQUESTED, BookingStatus.MATCHING, BookingStatus.OFFERED, ...ACTIVE_JOB_STATUSES];
  return onSnapshot(
    query(collection(db(), COLLECTIONS.bookings), where("status", "in", live), orderBy("createdAt", "desc"), limit(50)),
    (snap) => onData(parseDocs(bookingDoc, snap.docs.map(estimated), warn("booking"))),
    onError,
  );
}

export function watchCustomers(onData: (c: Customer[]) => void, onError: OnError): Unsub {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.customers), orderBy("createdAt", "desc"), limit(200)),
    (snap) => onData(parseDocs(customerDoc, snap.docs.map(estimated), warn("customer"))),
    onError,
  );
}

export function watchCustomer(uid: string, onData: (c: Customer | null) => void, onError: OnError): Unsub {
  return onSnapshot(doc(db(), paths.customer(uid)), (s) => onData(s.exists() ? parseDoc(customerDoc, estimated(s)) : null), onError);
}

export function watchAccount(uid: string, onData: (a: Account | null) => void, onError: OnError): Unsub {
  return onSnapshot(doc(db(), paths.user(uid)), (s) => onData(s.exists() ? parseDoc(userDoc, estimated(s)) : null), onError);
}

export function watchCustomerAddresses(uid: string, onData: (a: CustomerAddress[]) => void, onError: OnError): Unsub {
  return onSnapshot(
    query(collection(db(), paths.customerAddresses(uid)), orderBy("createdAt", "asc")),
    (snap) => onData(parseDocs(customerAddressDoc, snap.docs.map(estimated), warn("address"))),
    onError,
  );
}

/** A customer's or a technician's bookings, newest first. */
export function watchBookingsFor(role: "customerId" | "technicianId", uid: string, onData: (b: Booking[]) => void, onError: OnError): Unsub {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.bookings), where(role, "==", uid), orderBy("createdAt", "desc"), limit(50)),
    (snap) => onData(parseDocs(bookingDoc, snap.docs.map(estimated), warn("booking"))),
    onError,
  );
}

export function watchAuditLog(targetType: string | "ALL", onData: (a: AuditEntry[]) => void, onError: OnError): Unsub {
  const base = collection(db(), COLLECTIONS.adminActions);
  const q =
    targetType === "ALL"
      ? query(base, orderBy("createdAt", "desc"), limit(200))
      : query(base, where("targetType", "==", targetType), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const v = d.data({ serverTimestamps: "estimate" });
          return {
            id: d.id,
            adminUid: v.adminUid,
            actionType: v.actionType,
            targetType: v.targetType,
            targetId: v.targetId,
            before: v.before ?? null,
            after: v.after ?? null,
            reason: v.reason ?? null,
            createdAtMs: v.createdAt?.toMillis?.() ?? 0,
          };
        }),
      ),
    onError,
  );
}

export function watchPlatformSettings(onData: (s: PlatformSettingsDoc | null) => void, onError: OnError): Unsub {
  return onSnapshot(doc(db(), paths.platformSettings()), (s) => onData(s.exists() ? platformSettingsDoc.parse(s.data()) : null), onError);
}

export function watchCommissionRules(onData: (r: CommissionRule[]) => void, onError: OnError): Unsub {
  return onSnapshot(
    query(collection(db(), COLLECTIONS.commissionRules), orderBy("createdAt", "desc"), limit(200)),
    (snap) => onData(parseDocs(commissionRuleDoc, snap.docs.map(estimated), warn("commission rule"))),
    onError,
  );
}

/** Every service area, including hidden ones (admins only). */
export function watchAllAreas(onData: (a: Area[]) => void, onError: OnError): Unsub {
  return onSnapshot(
    collection(db(), COLLECTIONS.serviceAreas),
    (snap) => onData(parseDocs(serviceAreaDoc, snap.docs, warn("area")).sort((a, b) => a.name.localeCompare(b.name))),
    onError,
  );
}

export const adminStore = {
  suspendUser: (input: SetUserStatusInput) => call("suspendUser", input),
  reactivateUser: (input: SetUserStatusInput) => call("reactivateUser", input),
  updateSettings: (input: UpdatePlatformSettingsInput) => call("updatePlatformSettings", input),
  createCommissionRule: (input: CreateCommissionRuleInput) => call("createCommissionRule", input),
  setCommissionRuleActive: (input: SetCommissionRuleActiveInput) => call("setCommissionRuleActive", input),
  upsertArea: (input: UpsertServiceAreaInput) => call("upsertServiceArea", input),
  setAreaActive: (input: SetServiceAreaActiveInput) => call("setServiceAreaActive", input),
};
export type AdminStore = typeof adminStore;
