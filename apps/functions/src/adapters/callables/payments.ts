import { callables, paths } from "@serviceflow/firebase";
import { ForbiddenError, NotFoundError, paymentDoc } from "@serviceflow/shared";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { confirmCashPayment, handlePaymentEvent, initiatePayment } from "../../domains/payments/payments";
import { createPaymentProvider } from "../../integrations/payments/factory";
import { MockPaymentProvider } from "../../integrations/payments/mock-payment-provider";
import { db } from "../../lib/admin";
import { PAYMENT_PROVIDER, isFunctionsEmulator } from "../../lib/config";
import { withErrorMapping } from "../../lib/errors";
import { parseInput, requireActiveUser, requireCapability } from "../../lib/guards";

export const paymentProvider = () => createPaymentProvider(PAYMENT_PROVIDER.value(), { db: db(), emulator: isFunctionsEmulator() });

/** `payments-initiate` — the booking's customer pays (Mobile Money prompt) or chooses cash. */
export const initiate = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    return initiatePayment({ db: db(), provider: paymentProvider() }, actor.uid, parseInput(callables.initiatePayment.input, request.data));
  }),
);

/** `payments-confirmCash` — the assigned technician confirms the cash was received. */
export const confirmCash = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    return confirmCashPayment({ db: db(), provider: paymentProvider() }, actor.uid, parseInput(callables.confirmCashPayment.input, request.data));
  }),
);

/**
 * `dev-mockPaymentOutcome` — LOCAL EMULATOR ONLY. Plays the payer approving
 * or declining the prompt in the mock sandbox, then delivers the signed
 * webhook through the same verification path as a real provider's.
 */
export const mockPaymentOutcome = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    if (!isFunctionsEmulator()) throw new ForbiddenError("Not available.");
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.devMockPaymentOutcome.input, request.data);
    const provider = paymentProvider();
    if (!(provider instanceof MockPaymentProvider)) throw new ForbiddenError("Only available with the mock payment provider.");
    const snap = await db().doc(paths.payment(input.bookingId)).get();
    if (!snap.exists) throw new NotFoundError("Payment", input.bookingId);
    const payment = paymentDoc.parse(snap.data());
    if (payment.customerId !== actor.uid && request.auth?.token.admin !== true) throw new ForbiddenError("This isn't your booking.");
    if (!payment.providerReference) throw new NotFoundError("Payment attempt", input.bookingId);
    const webhook = await provider.settle(payment.providerReference, input.outcome);
    const event = provider.parseWebhook(Buffer.from(webhook.rawBody), webhook.headers);
    if (event) await handlePaymentEvent({ db: db(), provider }, event);
    return { ok: true as const, id: input.bookingId };
  }),
);
