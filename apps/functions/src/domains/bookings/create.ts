import { COLLECTIONS, paths } from "@serviceflow/firebase";
import {
  BookingActor,
  BookingStatus,
  type ChannelSource,
  ConflictError,
  type CreateBookingInput,
  DEFAULT_PLATFORM_SETTINGS,
  NotFoundError,
  QuoteStatus,
  ValidationError,
  customerAddressDoc,
  isOpenBooking,
  matchingDeadlineMs,
  platformSettingsDoc,
  scheduleProblem,
  serviceDoc,
} from "@serviceflow/shared";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { type BookingDeps, bookingIdFor } from "./common";

/** A customer can have this many unfinished bookings at once. */
export const MAX_OPEN_BOOKINGS = 3;
const OPEN_STATUSES = Object.values(BookingStatus).filter(isOpenBooking);

/**
 * `bookings-create` (plan §5.2): validates the service, time and place,
 * snapshots the service name and price range as the estimate, and creates
 * the booking in REQUESTED with its first history entry. The customer's
 * phone and directions go to the private contact document, which the
 * technician can read only after accepting. Idempotent per request.
 *
 * The adapter runs matching right after (REQUESTED → MATCHING, candidates).
 */
export async function createBooking(
  deps: BookingDeps,
  customerUid: string,
  input: CreateBookingInput & { addressId?: string; location?: { lat: number; lng: number; address?: string; notes?: string } },
  source: ChannelSource,
): Promise<{ ok: true; id: string }> {
  const { db } = deps;
  const nowMs = deps.now?.() ?? Date.now();
  const scheduledAtMs = input.scheduledAt ? Date.parse(input.scheduledAt) : null;
  const problem = scheduleProblem(input.preferredTime, scheduledAtMs, nowMs);
  if (problem) throw new ValidationError(problem, [{ path: "scheduledAt", message: problem }]);

  const id = bookingIdFor(customerUid, input.requestId);
  const bookingRef = db.doc(paths.booking(id));

  await db.runTransaction(async (tx) => {
    const [existing, serviceSnap, userSnap, customerSnap, settingsSnap, addressSnap, mine] = await Promise.all([
      tx.get(bookingRef),
      tx.get(db.doc(paths.service(input.serviceId))),
      tx.get(db.doc(paths.user(customerUid))),
      tx.get(db.doc(paths.customer(customerUid))),
      tx.get(db.doc(paths.platformSettings())),
      input.addressId ? tx.get(db.doc(paths.customerAddress(customerUid, input.addressId))) : Promise.resolve(null),
      tx.get(
        db
          .collection(COLLECTIONS.bookings)
          .where("customerId", "==", customerUid)
          .where("status", "in", OPEN_STATUSES)
          .limit(MAX_OPEN_BOOKINGS),
      ),
    ]);
    if (existing.exists) return; // retry of a request that already succeeded

    const service = serviceSnap.exists ? serviceDoc.safeParse(serviceSnap.data()) : null;
    if (!service?.success || !service.data.isActive) throw new ValidationError("This service isn't available right now.");

    if (mine.size >= MAX_OPEN_BOOKINGS) {
      throw new ConflictError(`You already have ${MAX_OPEN_BOOKINGS} open bookings. Finish or cancel one before requesting another.`);
    }

    let location: { lat: number; lng: number; address: string | null; areaId: string | null };
    let contactPlace: { directions: string | null; ghanaPostGps: string | null; notes: string | null };
    if (input.addressId) {
      if (!addressSnap?.exists) throw new NotFoundError("Address", input.addressId);
      const address = customerAddressDoc.parse(addressSnap.data());
      location = { ...address.location, address: `${address.label}, ${address.areaName}`, areaId: address.areaId };
      contactPlace = { directions: address.directions, ghanaPostGps: address.ghanaPostGps, notes: address.notes };
    } else {
      const pin = input.location!;
      location = { lat: pin.lat, lng: pin.lng, address: pin.address ?? null, areaId: null };
      contactPlace = { directions: null, ghanaPostGps: null, notes: pin.notes ?? null };
    }

    const settings = settingsSnap.exists ? platformSettingsDoc.parse(settingsSnap.data()) : DEFAULT_PLATFORM_SETTINGS;
    const customerName = (customerSnap.get("fullName") as string | undefined) ?? (userSnap.get("displayName") as string | undefined) ?? "";

    tx.create(bookingRef, {
      customerId: customerUid,
      technicianId: null,
      offeredTechnicianId: null,
      participantIds: [customerUid],
      serviceId: input.serviceId,
      serviceSnapshot: { name: service.data.name },
      technicianSnapshot: null,
      status: BookingStatus.REQUESTED,
      problemDescription: input.problemDescription,
      location,
      preferredTime: input.preferredTime,
      scheduledAt: scheduledAtMs === null ? null : Timestamp.fromMillis(scheduledAtMs),
      pricing: {
        estimateMinMinor: service.data.priceRange.minMinor,
        estimateMaxMinor: service.data.priceRange.maxMinor,
        quotedMinor: null,
        quoteStatus: QuoteStatus.NONE,
        quoteNote: null,
        quoteRejectionReason: null,
        priceSetBy: null,
        finalMinor: null,
        commissionPercentSnapshot: null,
        currency: settings.currency,
      },
      timeline: { requestedAt: FieldValue.serverTimestamp() },
      candidates: [],
      declinedTechnicianIds: [],
      offerExpiresAt: null,
      matchingExpiresAt: Timestamp.fromMillis(
        matchingDeadlineMs({ preferredTime: input.preferredTime, scheduledAtMs, currentDeadlineMs: null }, nowMs, settings.matchingExpiryMinutes),
      ),
      lastMatchedAt: null,
      source,
      cancellation: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(db.doc(paths.bookingContact(id)), {
      customerName,
      customerPhone: (userSnap.get("phone") as string | null | undefined) ?? null,
      ...contactPlace,
    });
    tx.create(db.collection(paths.bookingStatusHistory(id)).doc(), {
      from: null,
      to: BookingStatus.REQUESTED,
      actor: BookingActor.CUSTOMER,
      byUid: customerUid,
      note: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, id };
}
