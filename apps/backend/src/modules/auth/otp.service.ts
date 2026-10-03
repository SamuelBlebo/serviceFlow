import bcrypt from "bcryptjs";
import { prisma } from "@serviceflow/database";
import { UnauthorizedError, ValidationError } from "@serviceflow/shared";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

const MAX_ATTEMPTS = 5;

function generateCode(): string {
  const max = 10 ** env.OTP_LENGTH;
  const code = Math.floor(Math.random() * max)
    .toString()
    .padStart(env.OTP_LENGTH, "0");
  return code;
}

/**
 * Issues a fresh OTP for a user + purpose, persisted (hashed — codes are
 * never stored in plaintext) with an expiry. In production this hands off to
 * an SMS/WhatsApp provider; the mock provider here just logs it so local/dev
 * flows work without real telecom credentials.
 */
export async function issueOtp(userId: string, purpose: string): Promise<void> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  await prisma.otpCode.create({
    data: { userId, purpose, codeHash, expiresAt },
  });

  if (env.OTP_PROVIDER === "mock") {
    // Dev/mock channel only — replace with a real SMS/WhatsApp OTP provider
    // before going anywhere near production.
    logger.info({ userId, purpose, code }, "[MOCK OTP] code issued");
  }
}

export async function verifyOtp(userId: string, purpose: string, code: string): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw new ValidationError("No pending verification code — request a new one");
  }
  if (otp.expiresAt < new Date()) {
    throw new ValidationError("Verification code expired — request a new one");
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new UnauthorizedError("Too many incorrect attempts — request a new code");
  }

  const isValid = await bcrypt.compare(code, otp.codeHash);
  if (!isValid) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new ValidationError("Incorrect verification code");
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
}
