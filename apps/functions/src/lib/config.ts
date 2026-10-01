import { defineSecret, defineString } from "firebase-functions/params";

/**
 * Runtime configuration. Non-secret values are `defineString` params; secrets
 * are `defineSecret` (Secret Manager) and are only ever read inside Functions
 * — never shipped to the web or mobile apps.
 *
 * Stage 2 declares the shape; nothing reads the secrets yet, and no real
 * values are required to run the emulators.
 */

/**
 * Deploy region. PLACEHOLDER until Decision D3 (measure europe-west1 vs
 * africa-south1 latency from Accra). Firestore's location is permanent, so
 * this must be decided before a real project is created.
 */
export const FUNCTIONS_REGION = defineString("FUNCTIONS_REGION", { default: "europe-west1" });

export const PAYMENT_PROVIDER = defineString("PAYMENT_PROVIDER", { default: "mock" });
export const WHATSAPP_PROVIDER = defineString("WHATSAPP_PROVIDER", { default: "mock" });
export const OTP_PROVIDER = defineString("OTP_PROVIDER", { default: "mock" });

// Secrets — bound to individual functions with `secrets: [...]` when those
// functions are built in later stages.
export const PAYMENT_SECRET_KEY = defineSecret("PAYMENT_SECRET_KEY");
export const PAYMENT_WEBHOOK_SECRET = defineSecret("PAYMENT_WEBHOOK_SECRET");
export const WHATSAPP_ACCESS_TOKEN = defineSecret("WHATSAPP_ACCESS_TOKEN");
export const WHATSAPP_APP_SECRET = defineSecret("WHATSAPP_APP_SECRET");

export const SERVICE_NAME = "serviceflow-functions";

/** True inside the Firebase Functions emulator (set by the emulator itself). */
export function isFunctionsEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true";
}
