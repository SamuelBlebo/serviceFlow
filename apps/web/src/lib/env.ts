import { z } from "zod";

/**
 * Validated client configuration. Firebase web config values are public
 * identifiers, not secrets — secrets never reach the browser (they live in
 * Secret Manager and are only read by Cloud Functions).
 */
const envSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_FIREBASE_FUNCTIONS_REGION: z.string().min(1).default("europe-west1"),
  VITE_USE_EMULATORS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type ClientEnv = z.infer<typeof envSchema>;

export function readEnv(source: Record<string, unknown> = import.meta.env): ClientEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`ServiceFlow web is misconfigured. Check apps/web/.env (see .env.example): ${missing}`);
  }
  return parsed.data;
}
