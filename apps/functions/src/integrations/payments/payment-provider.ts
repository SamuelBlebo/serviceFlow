import type { MobileMoneyNetwork, PaymentMethod } from "@serviceflow/shared";

/**
 * Abstraction over the payment rail (ported from the legacy backend and
 * extended per SERVICEFLOW_MIGRATION_PLAN.md §14). Swapping providers
 * (Paystack, Hubtel, Flutterwave, …) means one new class implementing this
 * interface plus one case in the factory — domain code never imports a
 * provider SDK. All amounts are integer minor units (pesewas).
 *
 * NOT WIRED in Stage 2 — the Payments stage builds on this.
 */
export type ProviderPaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface InitiatePaymentInput {
  paymentId: string;
  amountMinor: number;
  currency: string;
  method: Exclude<PaymentMethod, "CASH">;
  msisdn?: string;
  network?: MobileMoneyNetwork;
  email?: string;
  idempotencyKey: string;
}

export interface ProviderResult {
  reference: string;
  status: ProviderPaymentStatus;
  authorizationUrl?: string;
  raw?: unknown;
}

export interface VerifyResult extends ProviderResult {
  amountMinor: number;
  currency: string;
}

export interface RefundInput {
  reference: string;
  amountMinor: number;
  reason?: string;
  idempotencyKey: string;
}

export interface TransferInput {
  payoutId: string;
  amountMinor: number;
  msisdn: string;
  network: MobileMoneyNetwork;
  accountName: string;
  idempotencyKey: string;
}

export interface ParsedWebhookEvent {
  eventId: string;
  type: string;
  reference: string;
  status: ProviderPaymentStatus;
}

export interface PaymentProvider {
  readonly id: string;
  initiatePayment(input: InitiatePaymentInput): Promise<ProviderResult>;
  /** Server-to-server re-verification — webhook bodies are never trusted alone. */
  verifyPayment(reference: string): Promise<VerifyResult>;
  refundPayment(input: RefundInput): Promise<ProviderResult>;
  transferToTechnician(input: TransferInput): Promise<ProviderResult>;
  /** Verifies the webhook signature over the raw body; returns null if invalid or irrelevant. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhookEvent | null;
}
