import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),

  OTP_PROVIDER: z.enum(["mock"]).default("mock"),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_LENGTH: z.coerce.number().default(6),

  WHATSAPP_PROVIDER: z.enum(["mock", "meta_cloud_api"]).default("mock"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default("dev-verify-token"),
  WHATSAPP_APP_SECRET: z.string().optional().default(""),

  PAYMENT_PROVIDER: z.enum(["mock", "paystack", "flutterwave", "hubtel"]).default("mock"),
  PAYMENT_PROVIDER_SECRET_KEY: z.string().optional().default(""),
  PAYMENT_PROVIDER_PUBLIC_KEY: z.string().optional().default(""),
  PAYMENT_WEBHOOK_SECRET: z.string().optional().default(""),

  DEFAULT_COMMISSION_PERCENT: z.coerce.number().default(15),
  DEFAULT_CURRENCY: z.string().default("GHS"),
  DEFAULT_COUNTRY: z.string().default("GH"),
  DEFAULT_CITY: z.string().default("Accra"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud — never start the server with an invalid config.
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
