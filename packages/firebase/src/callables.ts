import {
  advanceJobInput,
  cancelBookingInput,
  confirmCompletionInput,
  createBookingInput,
  healthOutput,
  initiatePaymentInput,
  registerTechnicianInput,
  requestOtpInput,
  reviewTechnicianInput,
  setServiceActiveInput,
  upsertServiceInput,
  requestOtpOutput,
  setUserStatusInput,
  verifyOtpInput,
  verifyOtpOutput,
  requestPayoutInput,
  respondToOfferInput,
  selectTechnicianInput,
  submitQuoteInput,
  submitRatingInput,
  submitVerificationInput,
  updateTechnicianServicesInput,
} from "@serviceflow/shared";
import { z } from "zod";

/**
 * The callable contract: one registry that both clients and Cloud Functions
 * import. Web and mobile call `callables.x.name` with `CallableInput<"x">`
 * and get back `CallableOutput<"x">`; the Function validates the same input
 * schema. Names follow the deployed Functions v2 grouping ("group-name").
 *
 * `stage` records when each callable is implemented. Implemented so far:
 * `health` (Stage 2), the `auth`/`admin` callables (Stage 3) and the
 * service-catalogue callables (Stage 5), technician onboarding and review
 * (Stage 6). The rest are
 * declared so the contract is fixed before building.
 */

export interface CallableDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  input: I;
  output: O;
  stage: "foundation" | "auth" | "admin" | "services" | "technicians" | "bookings" | "payments" | "wallet" | "ratings";
}

function defineCallable<I extends z.ZodType, O extends z.ZodType>(def: CallableDefinition<I, O>) {
  return def;
}

/** Generic result for mutations that create or update one document. */
export const mutationResult = z.object({ ok: z.literal(true), id: z.string() });

const empty = z.object({}).strict();

export const callables = {
  health: defineCallable({ name: "system-health", input: empty, output: healthOutput, stage: "foundation" }),

  requestOtp: defineCallable({ name: "auth-requestOtp", input: requestOtpInput, output: requestOtpOutput, stage: "auth" }),
  verifyOtp: defineCallable({ name: "auth-verifyOtp", input: verifyOtpInput, output: verifyOtpOutput, stage: "auth" }),
  suspendUser: defineCallable({ name: "admin-suspendUser", input: setUserStatusInput, output: mutationResult, stage: "admin" }),
  reactivateUser: defineCallable({
    name: "admin-reactivateUser",
    input: setUserStatusInput,
    output: mutationResult,
    stage: "admin",
  }),
  upsertService: defineCallable({ name: "admin-upsertService", input: upsertServiceInput, output: mutationResult, stage: "services" }),
  reviewTechnician: defineCallable({
    name: "admin-reviewTechnician",
    input: reviewTechnicianInput,
    output: mutationResult,
    stage: "technicians",
  }),
  setServiceActive: defineCallable({
    name: "admin-setServiceActive",
    input: setServiceActiveInput,
    output: mutationResult,
    stage: "services",
  }),

  registerTechnician: defineCallable({
    name: "technicians-register",
    input: registerTechnicianInput,
    output: mutationResult,
    stage: "technicians",
  }),
  updateTechnicianServices: defineCallable({
    name: "technicians-updateServices",
    input: updateTechnicianServicesInput,
    output: mutationResult,
    stage: "technicians",
  }),
  submitVerification: defineCallable({
    name: "technicians-submitVerification",
    input: submitVerificationInput,
    output: mutationResult,
    stage: "technicians",
  }),

  createBooking: defineCallable({ name: "bookings-create", input: createBookingInput, output: mutationResult, stage: "bookings" }),
  selectTechnician: defineCallable({
    name: "bookings-selectTechnician",
    input: selectTechnicianInput,
    output: mutationResult,
    stage: "bookings",
  }),
  respondToOffer: defineCallable({
    name: "bookings-respondToOffer",
    input: respondToOfferInput,
    output: mutationResult,
    stage: "bookings",
  }),
  advanceJob: defineCallable({ name: "bookings-advance", input: advanceJobInput, output: mutationResult, stage: "bookings" }),
  submitQuote: defineCallable({ name: "bookings-submitQuote", input: submitQuoteInput, output: mutationResult, stage: "bookings" }),
  confirmCompletion: defineCallable({
    name: "bookings-confirmCompletion",
    input: confirmCompletionInput,
    output: mutationResult,
    stage: "bookings",
  }),
  cancelBooking: defineCallable({ name: "bookings-cancel", input: cancelBookingInput, output: mutationResult, stage: "bookings" }),

  initiatePayment: defineCallable({
    name: "payments-initiate",
    input: initiatePaymentInput,
    output: z.object({
      ok: z.literal(true),
      id: z.string(),
      status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
      authorizationUrl: z.string().url().optional(),
    }),
    stage: "payments",
  }),
  requestPayout: defineCallable({ name: "wallet-requestPayout", input: requestPayoutInput, output: mutationResult, stage: "wallet" }),
  submitRating: defineCallable({ name: "ratings-submit", input: submitRatingInput, output: mutationResult, stage: "ratings" }),
} as const;

export type CallableKey = keyof typeof callables;
export type CallableInput<K extends CallableKey> = z.input<(typeof callables)[K]["input"]>;
export type CallableOutput<K extends CallableKey> = z.infer<(typeof callables)[K]["output"]>;
