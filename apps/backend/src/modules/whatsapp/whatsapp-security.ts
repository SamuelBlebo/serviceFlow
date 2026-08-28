import crypto from "node:crypto";
import { env } from "../../config/env";

/**
 * Verifies Meta's X-Hub-Signature-256 header over the raw request body.
 * Always call this before trusting webhook contents (spec §21). Returns
 * true (no-op) when running the mock provider in dev, since there's no
 * app secret to check against.
 */
export function verifyWhatsAppSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (env.WHATSAPP_PROVIDER !== "meta_cloud_api") return true;
  if (!env.WHATSAPP_APP_SECRET || !signatureHeader) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
