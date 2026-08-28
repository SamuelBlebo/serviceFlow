import jwt from "jsonwebtoken";
import type { Role } from "@home-service/database";
import { env } from "../../config/env";

export interface AccessTokenPayload {
  sub: string; // userId
  role: Role;
}

// env.JWT_ACCESS_TTL/JWT_REFRESH_TTL are validated as non-empty strings by
// zod (see config/env.ts) but that's a wider type than jsonwebtoken's
// `expiresIn` (a numeric seconds count or a branded "5m"/"1d"-style
// string) — the cast is safe because env.ts is the only place these values
// originate, and a malformed value fails loudly at sign time either way.
const accessTokenOptions: jwt.SignOptions = { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] };
const refreshTokenOptions: jwt.SignOptions = { expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"] };

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, accessTokenOptions);
}

export function signRefreshToken(payload: { sub: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, refreshTokenOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
}
