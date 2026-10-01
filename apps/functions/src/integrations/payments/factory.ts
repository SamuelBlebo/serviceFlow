import { MockPaymentProvider } from "./mock-payment-provider";
import type { PaymentProvider } from "./payment-provider";

/**
 * The ONLY place a payment provider is chosen. Real providers are added as
 * new cases — never by branching on the provider name anywhere else.
 */
export function createPaymentProvider(providerId: string): PaymentProvider {
  switch (providerId) {
    case "mock":
      return new MockPaymentProvider();
    default:
      throw new Error(
        `Payment provider "${providerId}" is not implemented yet — add an adapter in integrations/payments/`,
      );
  }
}
