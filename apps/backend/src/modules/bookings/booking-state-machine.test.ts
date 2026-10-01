import { describe, expect, it } from "vitest";
import { BookingStatus } from "@serviceflow/database";
import { assertActorCanTransition, assertValidBookingTransition, getValidNextStates } from "./booking-state-machine";

describe("booking state machine", () => {
  it("allows the full happy-path lifecycle in order", () => {
    const happyPath: Array<[BookingStatus, BookingStatus]> = [
      [BookingStatus.REQUESTED, BookingStatus.MATCHING],
      [BookingStatus.MATCHING, BookingStatus.OFFERED],
      [BookingStatus.OFFERED, BookingStatus.ACCEPTED],
      [BookingStatus.ACCEPTED, BookingStatus.EN_ROUTE],
      [BookingStatus.EN_ROUTE, BookingStatus.ARRIVED],
      [BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS],
      [BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED],
      [BookingStatus.COMPLETED, BookingStatus.CUSTOMER_CONFIRMED],
      [BookingStatus.CUSTOMER_CONFIRMED, BookingStatus.PAID],
    ];

    for (const [from, to] of happyPath) {
      expect(() => assertValidBookingTransition(from, to)).not.toThrow();
    }
  });

  it("rejects skipping straight from REQUESTED to PAID", () => {
    expect(() => assertValidBookingTransition(BookingStatus.REQUESTED, BookingStatus.PAID)).toThrow(
      /Invalid Booking transition/,
    );
  });

  it("rejects skipping intermediate steps (ACCEPTED -> COMPLETED)", () => {
    expect(() => assertValidBookingTransition(BookingStatus.ACCEPTED, BookingStatus.COMPLETED)).toThrow();
  });

  it("rejects any transition out of a terminal CANCELLED booking", () => {
    expect(getValidNextStates(BookingStatus.CANCELLED)).toEqual([]);
    expect(() => assertValidBookingTransition(BookingStatus.CANCELLED, BookingStatus.MATCHING)).toThrow();
  });

  it("allows a technician decline to return the booking to MATCHING", () => {
    expect(() => assertActorCanTransition(BookingStatus.OFFERED, BookingStatus.MATCHING, "TECHNICIAN")).not.toThrow();
  });

  it("does not allow a customer to advance a job's physical status", () => {
    expect(() => assertActorCanTransition(BookingStatus.ACCEPTED, BookingStatus.EN_ROUTE, "CUSTOMER")).toThrow(
      /cannot move a booking/,
    );
  });

  it("does not allow a technician to confirm completion on the customer's behalf", () => {
    expect(() =>
      assertActorCanTransition(BookingStatus.COMPLETED, BookingStatus.CUSTOMER_CONFIRMED, "TECHNICIAN"),
    ).toThrow();
  });

  it("only SYSTEM can mark a booking PAID", () => {
    expect(() =>
      assertActorCanTransition(BookingStatus.CUSTOMER_CONFIRMED, BookingStatus.PAID, "CUSTOMER"),
    ).toThrow();
    expect(() =>
      assertActorCanTransition(BookingStatus.CUSTOMER_CONFIRMED, BookingStatus.PAID, "SYSTEM"),
    ).not.toThrow();
  });

  it("lets an admin cancel a booking that has already been offered", () => {
    expect(() => assertActorCanTransition(BookingStatus.OFFERED, BookingStatus.CANCELLED, "ADMIN")).not.toThrow();
  });

  it("does not let a customer cancel once the technician has arrived on-site", () => {
    expect(() => assertActorCanTransition(BookingStatus.ARRIVED, BookingStatus.CANCELLED, "CUSTOMER")).toThrow();
    expect(() => assertActorCanTransition(BookingStatus.ARRIVED, BookingStatus.CANCELLED, "ADMIN")).not.toThrow();
  });

  it("allows a dispute to be raised after payment, but not resumed to any other live status", () => {
    expect(() => assertActorCanTransition(BookingStatus.PAID, BookingStatus.DISPUTED, "CUSTOMER")).not.toThrow();
    expect(getValidNextStates(BookingStatus.DISPUTED)).toEqual(
      expect.arrayContaining([BookingStatus.CANCELLED, BookingStatus.PAID]),
    );
  });
});
