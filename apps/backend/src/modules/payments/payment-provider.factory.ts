import { env } from "../../config/env";
import { MockPaymentProvider } from "./mock-payment-provider";
import type { PaymentProvider } from "./payment-provider.interface";

/**
 * Resolves the configured PaymentProvider. Real providers (Paystack,
 * Flutterwave, Hubtel) get added here as new `case` branches — never by
 * branching on env.PAYMENT_PROVIDER anywhere else in the codebase.
 */
export function getPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
      return new MockPaymentProvider();
    default:
      throw new Error(
        `Payment provider "${env.PAYMENT_PROVIDER}" is not implemented yet — add an adapter in modules/payments/`,
      );
  }
}
