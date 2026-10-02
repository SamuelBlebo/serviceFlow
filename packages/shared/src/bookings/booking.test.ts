import { describe, expect, it } from "vitest";
import { BookingStatus, PreferredTime } from "../enums";
import {
  createBookingInput,
  respondToQuoteInput,
  setBookingPriceInput,
  submitQuoteInput,
} from "../schemas/callables";
import {
  BOOKING_STATUS_LABELS,
  CONTACT_VISIBLE_STATUSES,
  QuoteStatus,
  TIMELINE_FIELD,
  canAdminSetPrice,
  canRespondToQuote,
  canSubmitQuote,
  isOpenBooking,
  isQuoteWithinRange,
  scheduleProblem,
} from "./booking";

const REQ = "req_12345678";
const NOW = Date.UTC(2026, 9, 2, 9, 0);
const MIN = 60_000;

describe("price authority (Decision D4)", () => {
  it("lets the assigned technician quote before work starts, until the price is agreed", () => {
    for (const s of [BookingStatus.ACCEPTED, BookingStatus.EN_ROUTE, BookingStatus.ARRIVED]) {
      expect(canSubmitQuote(s, QuoteStatus.NONE)).toBe(true);
      expect(canSubmitQuote(s, QuoteStatus.REJECTED)).toBe(true);
      expect(canSubmitQuote(s, QuoteStatus.PROPOSED)).toBe(true); // revise before the customer answers
      expect(canSubmitQuote(s, QuoteStatus.ACCEPTED)).toBe(false);
    }
    for (const s of [BookingStatus.REQUESTED, BookingStatus.OFFERED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED]) {
      expect(canSubmitQuote(s, QuoteStatus.NONE)).toBe(false);
    }
  });

  it("lets the customer answer only a proposed quote", () => {
    expect(canRespondToQuote(BookingStatus.ARRIVED, QuoteStatus.PROPOSED)).toBe(true);
    expect(canRespondToQuote(BookingStatus.ARRIVED, QuoteStatus.ACCEPTED)).toBe(false);
    expect(canRespondToQuote(BookingStatus.ARRIVED, QuoteStatus.NONE)).toBe(false);
    expect(canRespondToQuote(BookingStatus.IN_PROGRESS, QuoteStatus.PROPOSED)).toBe(false);
  });

  it("lets admins set the price until the customer confirms", () => {
    expect(canAdminSetPrice(BookingStatus.COMPLETED)).toBe(true);
    expect(canAdminSetPrice(BookingStatus.IN_PROGRESS)).toBe(true);
    expect(canAdminSetPrice(BookingStatus.CUSTOMER_CONFIRMED)).toBe(false);
    expect(canAdminSetPrice(BookingStatus.MATCHING)).toBe(false);
  });

  it("keeps technician quotes inside the service range (inclusive)", () => {
    const range = { estimateMinMinor: 10000, estimateMaxMinor: 30000 };
    expect(isQuoteWithinRange(10000, range)).toBe(true);
    expect(isQuoteWithinRange(30000, range)).toBe(true);
    expect(isQuoteWithinRange(9999, range)).toBe(false);
    expect(isQuoteWithinRange(30001, range)).toBe(false);
  });
});

describe("scheduleProblem", () => {
  it("needs no time for ASAP/TODAY/TOMORROW and rejects one", () => {
    expect(scheduleProblem(PreferredTime.ASAP, null, NOW)).toBeNull();
    expect(scheduleProblem(PreferredTime.TOMORROW, null, NOW)).toBeNull();
    expect(scheduleProblem(PreferredTime.TODAY, NOW + 120 * MIN, NOW)).toMatch(/Only scheduled/);
  });

  it("needs a scheduled time between one hour and 30 days ahead", () => {
    expect(scheduleProblem(PreferredTime.SCHEDULED, null, NOW)).toMatch(/Choose a date/);
    expect(scheduleProblem(PreferredTime.SCHEDULED, NOW + 30 * MIN, NOW)).toMatch(/60 minutes/);
    expect(scheduleProblem(PreferredTime.SCHEDULED, NOW + 60 * MIN, NOW)).toBeNull();
    expect(scheduleProblem(PreferredTime.SCHEDULED, NOW + 30 * 86_400_000, NOW)).toBeNull();
    expect(scheduleProblem(PreferredTime.SCHEDULED, NOW + 31 * 86_400_000, NOW)).toMatch(/30 days/);
    expect(scheduleProblem(PreferredTime.SCHEDULED, Number.NaN, NOW)).toMatch(/Choose a date/);
  });
});

describe("booking helpers", () => {
  it("maps every status to a timeline field and a customer label", () => {
    for (const s of Object.values(BookingStatus)) {
      expect(TIMELINE_FIELD[s]).toMatch(/At$/);
      expect(BOOKING_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(TIMELINE_FIELD)).size).toBe(Object.values(BookingStatus).length);
  });

  it("shows the customer's contact to the technician only once they've accepted", () => {
    expect(CONTACT_VISIBLE_STATUSES).not.toContain(BookingStatus.OFFERED);
    expect(CONTACT_VISIBLE_STATUSES).toContain(BookingStatus.ACCEPTED);
    expect(CONTACT_VISIBLE_STATUSES).not.toContain(BookingStatus.CANCELLED);
  });

  it("treats confirmed, paid and cancelled bookings as closed", () => {
    expect(isOpenBooking(BookingStatus.REQUESTED)).toBe(true);
    expect(isOpenBooking(BookingStatus.COMPLETED)).toBe(true);
    expect(isOpenBooking(BookingStatus.CUSTOMER_CONFIRMED)).toBe(false);
    expect(isOpenBooking(BookingStatus.CANCELLED)).toBe(false);
  });
});

describe("booking callable inputs", () => {
  const base = { requestId: REQ, serviceId: "plumbing", problemDescription: "Kitchen pipe is leaking", preferredTime: "ASAP" };

  it("takes a saved address or a location pin, not both and not neither", () => {
    expect(createBookingInput.safeParse({ ...base, addressId: "addr1" }).success).toBe(true);
    expect(createBookingInput.safeParse({ ...base, location: { lat: 5.6, lng: -0.18 } }).success).toBe(true);
    expect(createBookingInput.safeParse(base).success).toBe(false);
    expect(createBookingInput.safeParse({ ...base, addressId: "addr1", location: { lat: 5.6, lng: -0.18 } }).success).toBe(false);
    expect(createBookingInput.safeParse({ ...base, addressId: null, location: null }).success).toBe(false);
  });

  it("clients may say WEB or MOBILE, never WHATSAPP or ADMIN", () => {
    expect(createBookingInput.safeParse({ ...base, addressId: "a1", channel: "MOBILE" }).success).toBe(true);
    expect(createBookingInput.safeParse({ ...base, addressId: "a1", channel: null }).success).toBe(true);
    expect(createBookingInput.safeParse({ ...base, addressId: "a1", channel: "WHATSAPP" }).success).toBe(false);
    expect(createBookingInput.safeParse({ ...base, addressId: "a1", channel: "ADMIN" }).success).toBe(false);
  });

  it("asks for a real problem description", () => {
    const r = createBookingInput.safeParse({ ...base, addressId: "addr1", problemDescription: "Broken" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/at least 10/);
  });

  it("accepts ISO times with a Ghana (UTC) or other offset", () => {
    const scheduled = { ...base, addressId: "a1", preferredTime: "SCHEDULED" };
    expect(createBookingInput.safeParse({ ...scheduled, scheduledAt: "2026-10-05T10:00:00Z" }).success).toBe(true);
    expect(createBookingInput.safeParse({ ...scheduled, scheduledAt: "2026-10-05T10:00:00+00:00" }).success).toBe(true);
    expect(createBookingInput.safeParse({ ...scheduled, scheduledAt: "next tuesday" }).success).toBe(false);
  });

  it("quotes are positive whole pesewas", () => {
    expect(submitQuoteInput.safeParse({ requestId: REQ, bookingId: "b1", amountMinor: 25000, note: null }).success).toBe(true);
    expect(submitQuoteInput.safeParse({ requestId: REQ, bookingId: "b1", amountMinor: 0 }).success).toBe(false);
    expect(submitQuoteInput.safeParse({ requestId: REQ, bookingId: "b1", amountMinor: 250.5 }).success).toBe(false);
  });

  it("declining a quote needs a reason; accepting does not", () => {
    expect(respondToQuoteInput.safeParse({ requestId: REQ, bookingId: "b1", accept: true, reason: null }).success).toBe(true);
    expect(respondToQuoteInput.safeParse({ requestId: REQ, bookingId: "b1", accept: false }).success).toBe(false);
    expect(respondToQuoteInput.safeParse({ requestId: REQ, bookingId: "b1", accept: false, reason: "Too expensive" }).success).toBe(true);
  });

  it("admin price changes need a reason", () => {
    expect(setBookingPriceInput.safeParse({ requestId: REQ, bookingId: "b1", amountMinor: 50000, reason: "" }).success).toBe(false);
    expect(setBookingPriceInput.safeParse({ requestId: REQ, bookingId: "b1", amountMinor: 50000, reason: "Extra pipe replaced" }).success).toBe(true);
  });
});
