import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../common/http/asyncHandler";
import * as authController from "./auth.controller";

const otpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5, // 5 OTP requests/verifications per minute per IP — cheap defense against SMS-bombing/brute force
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();

authRouter.post("/otp/request", otpLimiter, asyncHandler(authController.requestOtp));
authRouter.post("/otp/verify", otpLimiter, asyncHandler(authController.verifyOtp));
authRouter.post("/admin/login", otpLimiter, asyncHandler(authController.adminLogin));
authRouter.post("/refresh", asyncHandler(authController.refresh));
