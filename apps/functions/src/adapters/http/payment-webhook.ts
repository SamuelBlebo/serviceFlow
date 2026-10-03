import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { handlePaymentEvent } from "../../domains/payments/payments";
import type { PaymentProvider } from "../../integrations/payments/payment-provider";
import { db } from "../../lib/admin";
import { paymentProvider } from "../callables/payments";

export interface WebhookRequest {
  method: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}
export interface WebhookResponse {
  status(code: number): WebhookResponse;
  json(body: unknown): void;
}

/**
 * Payment provider webhook. The signature is checked over the exact raw
 * body; unsigned or tampered requests get 401 and change nothing. Valid
 * events are de-duplicated and re-verified with the provider before any
 * payment is settled. Valid events always get 200 (even duplicates) so the
 * provider stops retrying.
 */
export async function paymentWebhookHandler(req: WebhookRequest, res: WebhookResponse, provider: PaymentProvider): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const event = provider.parseWebhook(req.rawBody, req.headers);
  if (!event) {
    logger.warn("Rejected payment webhook (bad or missing signature)");
    res.status(401).json({ error: "INVALID_SIGNATURE" });
    return;
  }
  const outcome = await handlePaymentEvent({ db: db(), provider }, event);
  res.status(200).json({ received: true, outcome });
}

/** `webhooks-payments` */
export const payments = onRequest(async (req, res) => {
  await paymentWebhookHandler(req, res, paymentProvider());
});
