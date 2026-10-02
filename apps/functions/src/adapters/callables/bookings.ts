import { callables } from "@serviceflow/firebase";
import { ChannelSource } from "@serviceflow/shared";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { createBooking } from "../../domains/bookings/create";
import { advanceJob, cancelBooking, confirmCompletion, reassignBooking, respondToOffer } from "../../domains/bookings/lifecycle";
import { respondToQuote, setBookingPrice, submitQuote } from "../../domains/bookings/pricing";
import { db } from "../../lib/admin";
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
    return createBooking({ db: db() }, actor.uid, input, input.channel ?? ChannelSource.WEB);
  }),
);

/** `bookings-respondToOffer` — the offered technician. */
export const respondToOfferCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    return respondToOffer({ db: db() }, actor.uid, parseInput(callables.respondToOffer.input, request.data));
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
    return reassignBooking({ db: db() }, actor.uid, parseInput(callables.reassignBooking.input, request.data));
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
