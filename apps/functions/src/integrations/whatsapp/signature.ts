import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's X-Hub-Signature-256 over the exact raw request bytes
 * (ported from legacy). Unlike the legacy version there is no "mock mode
 * bypass" here: callers decide explicitly whether a provider is signed.
 */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!appSecret || !signatureHeader) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
