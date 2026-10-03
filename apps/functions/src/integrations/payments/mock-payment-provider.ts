import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { maskMsisdn } from "@serviceflow/shared";
import type { Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import type {
  InitiatePaymentInput,
  ParsedWebhookEvent,
  PaymentProvider,
  ProviderPaymentStatus,
  ProviderResult,
  RefundInput,
  TransferInput,
  VerifyResult,
} from "./payment-provider";

/**
 * Development sandbox that behaves like a real Mobile Money provider:
 * charges start PENDING ("approve the prompt on your phone"), settle later,
 * and announce the outcome with an HMAC-signed webhook that our webhook
 * endpoint verifies, de-duplicates and re-verifies like any real one.
 *
 * Sandbox state lives in Firestore (`devMockPayments/{reference}`, closed to
 * clients) because function instances don't share memory. The factory only
 * allows this provider inside the Functions emulator.
 */
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
const SANDBOX = "devMockPayments";

export function signMockWebhook(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock";

  constructor(
    private readonly db: Firestore,
    private readonly webhookSecret: string,
  ) {}

  async initiatePayment(input: InitiatePaymentInput): Promise<ProviderResult> {
    // Same idempotency key → same reference and no second charge.
    const reference = `mock_${input.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const ref = this.db.collection(SANDBOX).doc(reference);
    await this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return;
      tx.create(ref, {
        paymentId: input.paymentId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: "PENDING",
        msisdnMasked: input.msisdn ? maskMsisdn(input.msisdn) : null,
        createdAt: new Date(),
      });
    });
    logger.info("[MOCK PAYMENT] prompt sent", { paymentId: input.paymentId, reference });
    return { reference, status: "PENDING", raw: { mock: true } };
  }

  async verifyPayment(reference: string): Promise<VerifyResult> {
    const snap = await this.db.collection(SANDBOX).doc(reference).get();
    if (!snap.exists) return { reference, status: "FAILED", amountMinor: 0, currency: "GHS", raw: { mock: true, missing: true } };
    const d = snap.data()!;
    return { reference, status: d.status as ProviderPaymentStatus, amountMinor: d.amountMinor, currency: d.currency, raw: { mock: true } };
  }

  /**
   * Sandbox only: the customer "approves" (or the network declines) the
   * prompt. Returns the signed webhook the provider would send.
   */
  async settle(reference: string, outcome: "SUCCEEDED" | "FAILED"): Promise<{ rawBody: string; headers: Record<string, string> }> {
    await this.db.collection(SANDBOX).doc(reference).update({ status: outcome, settledAt: new Date() });
    const rawBody = JSON.stringify({ eventId: `evt_${randomUUID()}`, type: "charge.updated", reference, status: outcome });
    return { rawBody, headers: { [MOCK_SIGNATURE_HEADER]: signMockWebhook(this.webhookSecret, rawBody), "content-type": "application/json" } };
  }

  async refundPayment(input: RefundInput): Promise<ProviderResult> {
    logger.info("[MOCK PAYMENT] refunded", { reference: input.reference, amountMinor: input.amountMinor });
    return { reference: input.reference, status: "SUCCEEDED", raw: { mock: true } };
  }

  async transferToTechnician(input: TransferInput): Promise<ProviderResult> {
    const reference = `mock_payout_${input.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    logger.info("[MOCK PAYMENT] transfer to technician", { payoutId: input.payoutId, amountMinor: input.amountMinor, reference });
    return { reference, status: "SUCCEEDED", raw: { mock: true } };
  }

  /** Verifies the HMAC over the exact raw body; anything unsigned or malformed is rejected. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhookEvent | null {
    const given = headers[MOCK_SIGNATURE_HEADER];
    if (typeof given !== "string") return null;
    const expected = Buffer.from(signMockWebhook(this.webhookSecret, rawBody.toString("utf8")), "hex");
    const actual = Buffer.from(given, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const body = JSON.parse(rawBody.toString("utf8")) as Partial<ParsedWebhookEvent>;
      if (!body.eventId || !body.reference || !body.status || !["PENDING", "SUCCEEDED", "FAILED"].includes(body.status)) return null;
      return { eventId: body.eventId, type: body.type ?? "charge.updated", reference: body.reference, status: body.status };
    } catch {
      return null;
    }
  }
}
