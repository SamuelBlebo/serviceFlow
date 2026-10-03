import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { sweepBookings } from "../../domains/bookings/matching";
import { db } from "../../lib/admin";

/**
 * `schedules-sweepBookings` — every minute: expire unanswered offers, cancel
 * bookings nobody could be matched to in time (D-12), and re-search bookings
 * left without candidates. The Functions emulator doesn't run schedules; the
 * sweep is covered by integration tests that call it directly.
 */
export const sweepBookingsSchedule = onSchedule({ schedule: "every 1 minutes", timeZone: "Africa/Accra" }, async () => {
  const result = await sweepBookings({ db: db() });
  if (result.offersExpired || result.cancelled || result.rematched) logger.info("Booking sweep", result);
});
