/**
 * ServiceFlow Cloud Functions entry point.
 *
 * Exported groups become deployed names "<group>-<name>" (e.g. `auth-requestOtp`),
 * matching the callable registry in @serviceflow/firebase.
 *
 * Implemented: health checks (Stage 2), phone sign-in and account status
 * administration (Stage 3), service catalogue administration (Stage 5),
 * technician onboarding and verification review (Stage 6), the booking
 * lifecycle and price agreement (Stage 7), matching, technician choice and
 * the expiry sweep (Stage 8), job photos and completion notes (Stage 9).
 * Further callables, webhooks, triggers and
 * schedulers are added stage by stage — see SERVICEFLOW_MIGRATION_PLAN.md.
 */
// Must stay the first import (see lib/global-options.ts).
import "./lib/global-options";
import { reactivateUser, suspendUser } from "./adapters/callables/admin";
import {
  addJobPhotoCallable,
  advance,
  cancel,
  confirmCompletionCallable,
  create,
  reassignBookingCallable,
  rematch,
  selectTechnicianCallable,
  respondToOfferCallable,
  respondToQuoteCallable,
  setBookingPriceCallable,
  submitQuoteCallable,
} from "./adapters/callables/bookings";
import { requestOtp, verifyOtp } from "./adapters/callables/auth";
import { setServiceActive, upsertService } from "./adapters/callables/catalogue";
import { health } from "./adapters/callables/health";
import { register, reviewTechnician, submitVerificationCallable, updateServices } from "./adapters/callables/technicians";
import { status } from "./adapters/http/status";
import { sweepBookingsSchedule } from "./adapters/schedulers/bookings";

export const system = { health, status };
export const auth = { requestOtp, verifyOtp };
export const admin = {
  suspendUser,
  reactivateUser,
  upsertService,
  setServiceActive,
  reviewTechnician,
  reassignBooking: reassignBookingCallable,
  setBookingPrice: setBookingPriceCallable,
};
export const technicians = { register, updateServices, submitVerification: submitVerificationCallable };
export const bookings = {
  create,
  selectTechnician: selectTechnicianCallable,
  rematch,
  respondToOffer: respondToOfferCallable,
  advance,
  addJobPhoto: addJobPhotoCallable,
  submitQuote: submitQuoteCallable,
  respondToQuote: respondToQuoteCallable,
  confirmCompletion: confirmCompletionCallable,
  cancel,
};
export const schedules = { sweepBookings: sweepBookingsSchedule };
