import type { Request, Response } from "express";
import { z } from "zod";
import { Role } from "@home-service/database";
import * as authService from "./auth.service";

const requestOtpSchema = z.object({
  phone: z.string().min(1),
  role: z.enum([Role.CUSTOMER, Role.TECHNICIAN]),
});

export async function requestOtp(req: Request, res: Response) {
  const { phone, role } = requestOtpSchema.parse(req.body);
  await authService.requestOtpLogin(phone, role);
  res.status(200).json({ message: "Verification code sent" });
}

const verifyOtpSchema = z.object({
  phone: z.string().min(1),
  code: z.string().min(4),
});

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code } = verifyOtpSchema.parse(req.body);
  const tokens = await authService.verifyOtpLogin(phone, code);
  res.status(200).json(tokens);
}

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function adminLogin(req: Request, res: Response) {
  const { email, password } = adminLoginSchema.parse(req.body);
  const tokens = await authService.adminLogin(email, password);
  res.status(200).json(tokens);
}

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await authService.refreshAccessToken(refreshToken);
  res.status(200).json(tokens);
}
