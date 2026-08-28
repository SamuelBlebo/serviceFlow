import type { PaymentMethod } from "@home-service/database";

/**
 * Abstraction over the actual payment rail. Swapping providers (Paystack,
 * Flutterwave, Hubtel, ...) means writing one new class implementing this
 * interface and flipping env.PAYMENT_PROVIDER — nothing else in the app
 * should ever import a provider SDK directly.
 */
export interface InitiatePaymentInput {
  paymentId: string;
  amount: number;
  currency: string;
  customerPhone: string;
  method: PaymentMethod;
}

export interface ProviderResult {
  providerReference: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  raw?: unknown;
}

export interface RefundPaymentInput {
  providerReference: string;
  amount: number;
  reason?: string;
}

export interface TransferToTechnicianInput {
  payoutId: string;
  amount: number;
  technicianPhone: string;
  method: string; // e.g. "MTN_MOMO"
}

export interface PaymentProvider {
  initiatePayment(input: InitiatePaymentInput): Promise<ProviderResult>;
  verifyPayment(providerReference: string): Promise<ProviderResult>;
  refundPayment(input: RefundPaymentInput): Promise<ProviderResult>;
  transferToTechnician(input: TransferToTechnicianInput): Promise<ProviderResult>;
}
