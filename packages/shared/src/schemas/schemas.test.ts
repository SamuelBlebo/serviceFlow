import { describe, expect, it } from "vitest";
import { BookingStatus, PaymentMethod, PreferredTime } from "../enums";
import { advanceJobInput, createBookingInput, initiatePaymentInput, requestPayoutInput, submitRatingInput } from "./callables";
import { DEFAULT_PLATFORM_SETTINGS, platformSettingsDoc, serviceDoc } from "./documents";
import { minorAmount, timestampLike } from "./primitives";

const REQ = "req_12345678";

describe("primitives", () => {
  it("minorAmount only accepts whole non-negative pesewas", () => {
    expect(minorAmount.safeParse(2500).success).toBe(true);
    expect(minorAmount.safeParse(25.5).success).toBe(false);
    expect(minorAmount.safeParse(-1).success).toBe(false);
  });

  it("timestampLike accepts anything with toMillis()", () => {
    expect(timestampLike.safeParse({ toMillis: () => 0 }).success).toBe(true);
    expect(timestampLike.safeParse(new Date()).success).toBe(false);
  });
});

describe("serviceDoc", () => {
  const valid = {
    name: "Plumbing",
    slug: "plumbing",
    description: "Leaks and pipes",
    iconPath: null,
    priceRange: { minMinor: 10000, maxMinor: 40000 },
    isActive: true,
    sortOrder: 1,
  };

  it("accepts a valid service", () => {
    expect(serviceDoc.safeParse(valid).success).toBe(true);
  });

  it("rejects an inverted price range and a bad slug", () => {
    expect(serviceDoc.safeParse({ ...valid, priceRange: { minMinor: 5, maxMinor: 1 } }).success).toBe(false);
    expect(serviceDoc.safeParse({ ...valid, slug: "Not A Slug" }).success).toBe(false);
  });
});

describe("platformSettingsDoc", () => {
  it("the shipped defaults are themselves valid", () => {
    expect(platformSettingsDoc.safeParse(DEFAULT_PLATFORM_SETTINGS).success).toBe(true);
    expect(DEFAULT_PLATFORM_SETTINGS.timezone).toBe("Africa/Accra");
    expect(DEFAULT_PLATFORM_SETTINGS.defaultCommissionPercent).toBe(15);
  });
});

describe("createBookingInput", () => {
  const base = {
    requestId: REQ,
    serviceId: "plumbing",
    problemDescription: "Kitchen pipe is leaking",
    location: { lat: 5.6494, lng: -0.1531 },
    preferredTime: PreferredTime.ASAP,
  };

  it("accepts an ASAP booking", () => {
    expect(createBookingInput.safeParse(base).success).toBe(true);
  });

  it("requires scheduledAt for SCHEDULED bookings (legacy rule)", () => {
    expect(createBookingInput.safeParse({ ...base, preferredTime: PreferredTime.SCHEDULED }).success).toBe(false);
    expect(
      createBookingInput.safeParse({ ...base, preferredTime: PreferredTime.SCHEDULED, scheduledAt: "2026-10-01T10:00:00Z" })
        .success,
    ).toBe(true);
  });

  it("requires an idempotency requestId", () => {
    const { requestId: _omit, ...withoutRequestId } = base;
    expect(createBookingInput.safeParse(withoutRequestId).success).toBe(false);
  });
});

describe("advanceJobInput", () => {
  it("only allows the technician's physical job steps", () => {
    expect(advanceJobInput.safeParse({ requestId: REQ, bookingId: "b1", to: BookingStatus.EN_ROUTE }).success).toBe(true);
    expect(advanceJobInput.safeParse({ requestId: REQ, bookingId: "b1", to: BookingStatus.PAID }).success).toBe(false);
    expect(advanceJobInput.safeParse({ requestId: REQ, bookingId: "b1", to: BookingStatus.ACCEPTED }).success).toBe(false);
  });
});

describe("money inputs", () => {
  it("Mobile Money payment needs phone and network", () => {
    expect(
      initiatePaymentInput.safeParse({ requestId: REQ, bookingId: "b1", method: PaymentMethod.MOBILE_MONEY }).success,
    ).toBe(false);
    expect(
      initiatePaymentInput.safeParse({
        requestId: REQ,
        bookingId: "b1",
        method: PaymentMethod.MOBILE_MONEY,
        msisdn: "0241234567",
        network: "MTN_MOMO",
      }).success,
    ).toBe(true);
  });

  it("payout needs a positive whole amount and a Ghana number", () => {
    const ok = { requestId: REQ, amountMinor: 5000, network: "MTN_MOMO", msisdn: "0241234567" };
    expect(requestPayoutInput.safeParse(ok).success).toBe(true);
    expect(requestPayoutInput.safeParse({ ...ok, amountMinor: 0 }).success).toBe(false);
    expect(requestPayoutInput.safeParse({ ...ok, msisdn: "+14155552671" }).success).toBe(false);
  });

  it("rating score is an integer 1..5", () => {
    expect(submitRatingInput.safeParse({ requestId: REQ, bookingId: "b1", score: 5 }).success).toBe(true);
    expect(submitRatingInput.safeParse({ requestId: REQ, bookingId: "b1", score: 6 }).success).toBe(false);
    expect(submitRatingInput.safeParse({ requestId: REQ, bookingId: "b1", score: 4.5 }).success).toBe(false);
  });
});
