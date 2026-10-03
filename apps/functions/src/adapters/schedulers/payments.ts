import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { reconcilePayments } from "../../domains/payments/payments";
import { db } from "../../lib/admin";
import { paymentProvider } from "../callables/payments";

/** `schedules-reconcilePayments` — every 10 minutes, re-verify Mobile Money attempts still pending (lost webhooks). */
export const reconcilePaymentsSchedule = onSchedule({ schedule: "every 10 minutes", timeZone: "Africa/Accra" }, async () => {
  const result = await reconcilePayments({ db: db(), provider: paymentProvider() });
  if (result.paid || result.failed) logger.info("Payment reconciliation", result);
});
