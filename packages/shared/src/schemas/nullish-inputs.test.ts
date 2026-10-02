import { describe, expect, it } from "vitest";
import {
  cancelBookingInput,
  createBookingInput,
  initiatePaymentInput,
  respondToOfferInput,
  setServiceActiveInput,
  submitRatingInput,
  upsertServiceInput,
} from "./callables";

/**
 * Firebase callable SDKs serialise `undefined` as `null`. A client that
 * leaves an optional field undefined therefore SENDS null — so every optional
 * callable field must treat null exactly like "absent". (Found in Stage 5:
 * creating a service from the admin page failed with "Invalid request".)
 */
const REQ = "req_12345678";

describe("optional callable fields accept null as 'absent'", () => {
  it("upsertService: serviceId null means create", () => {
    const parsed = upsertServiceInput.parse({
      requestId: REQ,
      serviceId: null,
      name: "Carpentry",
      description: "",
      priceRange: { minMinor: 100, maxMinor: 200 },
      sortOrder: 1,
    });
    expect(parsed.serviceId).toBeUndefined();
  });

  it("setServiceActive: reason null is no reason", () => {
    expect(setServiceActiveInput.parse({ requestId: REQ, serviceId: "plumbing", isActive: false, reason: null }).reason).toBeUndefined();
  });

  it("createBooking: null address, notes and scheduledAt", () => {
    const parsed = createBookingInput.parse({
      requestId: REQ,
      serviceId: "plumbing",
      problemDescription: "Leaking pipe",
      location: { lat: 5.6, lng: -0.18, address: null, notes: null },
      preferredTime: "ASAP",
      scheduledAt: null,
    });
    expect(parsed.scheduledAt).toBeUndefined();
    expect(parsed.location?.address).toBeUndefined();
  });

  it("other callables with optional fields", () => {
    expect(respondToOfferInput.parse({ requestId: REQ, bookingId: "b1", accept: false, reason: null }).reason).toBeUndefined();
    expect(submitRatingInput.parse({ requestId: REQ, bookingId: "b1", score: 5, comment: null }).comment).toBeUndefined();
    expect(initiatePaymentInput.parse({ requestId: REQ, bookingId: "b1", method: "CASH", msisdn: null, network: null }).msisdn).toBeUndefined();
    expect(cancelBookingInput.safeParse({ requestId: REQ, bookingId: "b1", reason: "Changed my mind" }).success).toBe(true);
  });

  it("still validates a present value", () => {
    expect(setServiceActiveInput.safeParse({ requestId: REQ, serviceId: "plumbing", isActive: false, reason: "x".repeat(301) }).success).toBe(false);
  });
});
