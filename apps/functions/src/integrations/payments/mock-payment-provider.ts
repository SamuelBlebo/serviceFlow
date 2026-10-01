import { randomUUID } from "node:crypto";
import { logger } from "firebase-functions";
import type {
  InitiatePaymentInput,
  ParsedWebhookEvent,
  PaymentProvider,
  ProviderResult,
  RefundInput,
  TransferInput,
  VerifyResult,
} from "./payment-provider";

/**
 * Development provider (ported from legacy): succeeds synchronously so the
 * booking -> payment -> payout loop can run end to end without real Mobile
 * Money credentials. Must never be selected in production.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock";
  private readonly amounts = new Map<string, { amountMinor: number; currency: string }>();

  async initiatePayment(input: InitiatePaymentInput): Promise<ProviderResult> {
    const reference = `mock_${randomUUID()}`;
    this.amounts.set(reference, { amountMinor: input.amountMinor, currency: input.currency });
    logger.info("[MOCK PAYMENT] initiated", { paymentId: input.paymentId, amountMinor: input.amountMinor, reference });
    return { reference, status: "SUCCEEDED", raw: { mock: true } };
  }

  async verifyPayment(reference: string): Promise<VerifyResult> {
    const known = this.amounts.get(reference) ?? { amountMinor: 0, currency: "GHS" };
    return { reference, status: "SUCCEEDED", ...known, raw: { mock: true } };
  }

  async refundPayment(input: RefundInput): Promise<ProviderResult> {
    logger.info("[MOCK PAYMENT] refunded", { reference: input.reference, amountMinor: input.amountMinor });
    return { reference: input.reference, status: "SUCCEEDED", raw: { mock: true } };
  }

  async transferToTechnician(input: TransferInput): Promise<ProviderResult> {
    const reference = `mock_payout_${randomUUID()}`;
    logger.info("[MOCK PAYMENT] transfer to technician", {
      payoutId: input.payoutId,
      amountMinor: input.amountMinor,
      reference,
    });
    return { reference, status: "SUCCEEDED", raw: { mock: true } };
  }

  parseWebhook(): ParsedWebhookEvent | null {
    return null; // The mock settles synchronously; it never sends webhooks.
  }
}
