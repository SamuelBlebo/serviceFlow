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
 * the expiry sweep (Stage 8), job photos and completion notes (Stage 9),
 * platform settings, commission rules and service areas (Stage 10),
 * payments: invoice, Mobile Money (signed webhook + reconciliation), cash
 * and the wallet ledger entries (Stage 11).
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
import {
  createCommissionRule,
  setCommissionRuleActive,
  setServiceAreaActive,
  updatePlatformSettings,
  upsertServiceArea,
} from "./adapters/callables/settings";
import { health } from "./adapters/callables/health";
import { register, reviewTechnician, submitVerificationCallable, updateServices } from "./adapters/callables/technicians";
import { payments as paymentsWebhook } from "./adapters/http/payment-webhook";
import { status } from "./adapters/http/status";
import { confirmCash, initiate, mockPaymentOutcome } from "./adapters/callables/payments";
import { reconcilePaymentsSchedule } from "./adapters/schedulers/payments";
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
  updatePlatformSettings,
  createCommissionRule,
  setCommissionRuleActive,
  upsertServiceArea,
  setServiceAreaActive,
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
export const schedules = { sweepBookings: sweepBookingsSchedule, reconcilePayments: reconcilePaymentsSchedule };
export const payments = { initiate, confirmCash };
export const webhooks = { payments: paymentsWebhook };
export const dev = { mockPaymentOutcome };
