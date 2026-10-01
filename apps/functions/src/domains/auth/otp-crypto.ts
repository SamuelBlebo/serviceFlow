import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { OTP_POLICY } from "@serviceflow/shared";

/**
 * OTP generation and hashing. Codes come from the CSPRNG (the legacy code
 * used Math.random — defect D-16) and are stored only as a salted scrypt
 * hash, so a database read never reveals a usable code.
 */

const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

export function generateOtpCode(length: number = OTP_POLICY.codeLength): string {
  return randomInt(0, 10 ** length)
    .toString()
    .padStart(length, "0");
}

function derive(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashOtpCode(code: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const key = await derive(code, salt);
  return { hash: key.toString("base64"), salt: salt.toString("base64") };
}

export async function verifyOtpCode(code: string, hash: string, salt: string): Promise<boolean> {
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(code, Buffer.from(salt, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
