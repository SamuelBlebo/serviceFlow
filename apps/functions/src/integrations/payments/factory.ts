import type { Firestore } from "firebase-admin/firestore";
import { MockPaymentProvider } from "./mock-payment-provider";
import type { PaymentProvider } from "./payment-provider";

/** Not a secret: signs the local sandbox's webhooks only (the mock never runs outside the emulator). */
export const MOCK_WEBHOOK_SECRET = "dev-mock-webhook-secret";

/**
 * The ONLY place a payment provider is chosen. Real providers are added as
 * new cases — never by branching on the provider name anywhere else.
 */
export function createPaymentProvider(providerId: string, deps: { db: Firestore; emulator: boolean }): PaymentProvider {
  switch (providerId) {
    case "mock":
      if (!deps.emulator) throw new Error("The mock payment provider only runs in the local emulator. Configure a real PAYMENT_PROVIDER.");
      return new MockPaymentProvider(deps.db, MOCK_WEBHOOK_SECRET);
    default:
      throw new Error(`Payment provider "${providerId}" is not implemented yet — add an adapter in integrations/payments/`);
  }
}
