import { describe, expect, it } from "vitest";
import { BookingActor, BookingStatus } from "../enums";
import {
  assertActorCanTransition,
  canActorTransition,
  getNextStatesForActor,
  getValidNextStates,
  isTerminalStatus,
} from "./state-machine";

const ALL_STATUSES = Object.values(BookingStatus);
const ALL_ACTORS = Object.values(BookingActor);

describe("canActorTransition agrees with assertActorCanTransition for every (from, to, actor)", () => {
  it("never disagrees", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const actor of ALL_ACTORS) {
          let asserted = true;
          try {
            assertActorCanTransition(from, to, actor);
          } catch {
            asserted = false;
          }
          expect(canActorTransition(from, to, actor), `${from} -> ${to} as ${actor}`).toBe(asserted);
        }
      }
    }
  });
});

describe("getNextStatesForActor", () => {
  it("gives the technician exactly one forward step through the physical job", () => {
    expect(getNextStatesForActor(BookingStatus.ACCEPTED, BookingActor.TECHNICIAN)).toEqual([
      BookingStatus.EN_ROUTE,
      BookingStatus.CANCELLED,
    ]);
    expect(getNextStatesForActor(BookingStatus.EN_ROUTE, BookingActor.TECHNICIAN)).toContain(BookingStatus.ARRIVED);
    expect(getNextStatesForActor(BookingStatus.ARRIVED, BookingActor.TECHNICIAN)).toEqual([BookingStatus.IN_PROGRESS]);
  });

  it("offers the customer nothing while a technician is travelling except cancellation", () => {
    expect(getNextStatesForActor(BookingStatus.EN_ROUTE, BookingActor.CUSTOMER)).toEqual([BookingStatus.CANCELLED]);
  });

  it("never lets any client actor reach PAID from CUSTOMER_CONFIRMED", () => {
    for (const actor of [BookingActor.CUSTOMER, BookingActor.TECHNICIAN, BookingActor.ADMIN]) {
      expect(getNextStatesForActor(BookingStatus.CUSTOMER_CONFIRMED, actor)).not.toContain(BookingStatus.PAID);
    }
  });
});

describe("isTerminalStatus", () => {
  it("treats only CANCELLED as terminal", () => {
    const terminal = ALL_STATUSES.filter(isTerminalStatus);
    expect(terminal).toEqual([BookingStatus.CANCELLED]);
    expect(getValidNextStates(BookingStatus.PAID)).toEqual([BookingStatus.DISPUTED]);
  });
});
