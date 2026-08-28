import { randomUUID } from "node:crypto";
import { logger } from "../../config/logger";
import type {
  InitiatePaymentInput,
  PaymentProvider,
  ProviderResult,
  RefundPaymentInput,
  TransferToTechnicianInput,
} from "./payment-provider.interface";

/**
 * Dev/demo provider: "succeeds" synchronously so the whole booking → payment
 * → payout loop can be exercised end-to-end without real Mobile Money or
 * card credentials. Cash/manual settlement (spec §13) is represented the
 * same way — a booking marked paid without a live rail behind it.
 */
export class MockPaymentProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<ProviderResult> {
    const providerReference = `mock_${randomUUID()}`;
    logger.info({ ...input, providerReference }, "[MOCK PAYMENT] initiated");
    return { providerReference, status: "SUCCEEDED", raw: { mock: true } };
  }

  async verifyPayment(providerReference: string): Promise<ProviderResult> {
    return { providerReference, status: "SUCCEEDED", raw: { mock: true } };
  }

  async refundPayment(input: RefundPaymentInput): Promise<ProviderResult> {
    logger.info(input, "[MOCK PAYMENT] refunded");
    return { providerReference: input.providerReference, status: "SUCCEEDED", raw: { mock: true } };
  }

  async transferToTechnician(input: TransferToTechnicianInput): Promise<ProviderResult> {
    const providerReference = `mock_payout_${randomUUID()}`;
    logger.info({ ...input, providerReference }, "[MOCK PAYMENT] transfer to technician");
    return { providerReference, status: "SUCCEEDED", raw: { mock: true } };
  }
}
