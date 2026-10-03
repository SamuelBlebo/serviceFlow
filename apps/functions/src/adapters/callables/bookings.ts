import { callables } from "@serviceflow/firebase";
import { ChannelSource } from "@serviceflow/shared";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { createBooking } from "../../domains/bookings/create";
import { advanceJob, cancelBooking, confirmCompletion, reassignBooking, respondToOffer } from "../../domains/bookings/lifecycle";
import { matchBooking, rematchBooking, rematchIfExhausted, selectTechnician } from "../../domains/bookings/matching";
import { respondToQuote, setBookingPrice, submitQuote } from "../../domains/bookings/pricing";
import { logger } from "firebase-functions";
import { addJobPhoto } from "../../domains/bookings/media";
import { bucket, db } from "../../lib/admin";
import { withErrorMapping } from "../../lib/errors";
import { parseInput, requireActiveUser, requireCapability, requireRecentSignIn } from "../../lib/guards";

/*
 * Booking callables. Every one checks an active account; ownership and the
 * allowed actor are enforced in the domain (state machine + assertions),
 * never by the client.
 */

/** `bookings-create` — any active signed-in user is a customer. */
export const create = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.createBooking.input, request.data);
    const result = await createBooking({ db: db() }, actor.uid, input, input.channel ?? ChannelSource.WEB);
    // Matching runs right away; if it fails the booking still exists and the
    // scheduled sweep (or the customer's "search again") retries.
    await matchBooking({ db: db() }, result.id).catch((err) => logger.warn("Initial matching failed", { bookingId: result.id, err }));
    return result;
  }),
);

/** `bookings-selectTechnician` — the customer offers the job to a recommended technician. */
export const selectTechnicianCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    return selectTechnician({ db: db() }, actor.uid, parseInput(callables.selectTechnician.input, request.data));
  }),
);

/** `bookings-rematch` — the customer asks for a fresh search. */
export const rematch = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    const { ok, id } = await rematchBooking({ db: db() }, actor.uid, parseInput(callables.rematchBooking.input, request.data));
    return { ok, id };
  }),
);

/** `bookings-respondToOffer` — the offered technician. */
export const respondToOfferCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.respondToOffer.input, request.data);
    const result = await respondToOffer({ db: db() }, actor.uid, input);
    if (!input.accept) await rematchIfExhausted({ db: db() }, input.bookingId);
    return result;
  }),
);

/** `bookings-advance` — the assigned technician's next job step. */
export const advance = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    return advanceJob({ db: db() }, actor.uid, parseInput(callables.advanceJob.input, request.data));
  }),
);

/** `bookings-submitQuote` — the assigned technician's price. */
export const submitQuoteCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    return submitQuote({ db: db() }, actor.uid, parseInput(callables.submitQuote.input, request.data));
  }),
);

/** `bookings-respondToQuote` — the booking's customer. */
export const respondToQuoteCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    return respondToQuote({ db: db() }, actor.uid, parseInput(callables.respondToQuote.input, request.data));
  }),
);

/** `bookings-confirmCompletion` — the booking's customer. */
export const confirmCompletionCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    return confirmCompletion({ db: db() }, actor.uid, parseInput(callables.confirmCompletion.input, request.data));
  }),
);

/** `bookings-cancel` — customer, assigned technician or admin (audited). */
export const cancel = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.cancelBooking.input, request.data);
    return cancelBooking({ db: db() }, { uid: actor.uid, isAdmin: request.auth?.token.admin === true }, input);
  }),
);

/** `admin-reassignBooking` — admin, audited. */
export const reassignBookingCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.reassignBooking.input, request.data);
    const result = await reassignBooking({ db: db() }, actor.uid, input);
    await rematchIfExhausted({ db: db() }, input.bookingId);
    return result;
  }),
);

/** `admin-setBookingPrice` — admin, recent sign-in (money), audited. */
export const setBookingPriceCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    requireRecentSignIn(request);
    const actor = await requireActiveUser(request, db());
    return setBookingPrice({ db: db() }, actor.uid, parseInput(callables.setBookingPrice.input, request.data));
  }),
);

/** `bookings-addJobPhoto` — the assigned technician's before/after photos. */
export const addJobPhotoCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    return addJobPhoto({ db: db(), bucket: bucket() }, actor.uid, parseInput(callables.addJobPhoto.input, request.data));
  }),
);
