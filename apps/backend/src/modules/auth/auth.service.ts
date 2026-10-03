import bcrypt from "bcryptjs";
import { prisma, Role } from "@serviceflow/database";
import { UnauthorizedError, ValidationError, isValidGhanaPhone, normalizeGhanaPhone } from "@serviceflow/shared";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt";
import { issueOtp, verifyOtp } from "./otp.service";

const OTP_PURPOSE_LOGIN = "LOGIN";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Starts phone+OTP auth for a CUSTOMER or TECHNICIAN. Creates the user
 * record on first contact (phone-first onboarding — no separate "sign up"
 * step) so a technician's very first action is just "enter phone, get code".
 */
export async function requestOtpLogin(rawPhone: string, role: Extract<Role, "CUSTOMER" | "TECHNICIAN">) {
  if (!isValidGhanaPhone(rawPhone)) {
    throw new ValidationError("Enter a valid Ghanaian phone number");
  }
  const phone = normalizeGhanaPhone(rawPhone)!;

  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, role },
  });

  if (user.role !== role) {
    throw new ValidationError(`This phone number is already registered as ${user.role.toLowerCase()}`);
  }
  if (user.status === "SUSPENDED") {
    throw new UnauthorizedError("This account has been suspended");
  }

  await issueOtp(user.id, OTP_PURPOSE_LOGIN);
  return { userId: user.id, phone };
}

export async function verifyOtpLogin(rawPhone: string, code: string): Promise<TokenPair> {
  const phone = normalizeGhanaPhone(rawPhone);
  if (!phone) throw new ValidationError("Enter a valid Ghanaian phone number");

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new ValidationError("No account found for this phone number");

  await verifyOtp(user.id, OTP_PURPOSE_LOGIN, code);

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id }),
  };
}

export async function adminLogin(email: string, password: string): Promise<TokenPair> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== Role.ADMIN || !user.passwordHash) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (user.status === "SUSPENDED") {
    throw new UnauthorizedError("This account has been suspended");
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id }),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  let userId: string;
  try {
    userId = verifyRefreshToken(refreshToken).sub;
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "SUSPENDED") {
    throw new UnauthorizedError("Account unavailable");
  }

  return { accessToken: signAccessToken({ sub: user.id, role: user.role }) };
}
