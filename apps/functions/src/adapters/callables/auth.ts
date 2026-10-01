import { callables } from "@serviceflow/firebase";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { type OtpDeps, requestOtp as requestOtpFlow, verifyOtp as verifyOtpFlow } from "../../domains/auth/otp-service";
import { createOtpSender } from "../../integrations/otp/factory";
import { adminAuth, db } from "../../lib/admin";
import { OTP_PROVIDER, isFunctionsEmulator } from "../../lib/config";
import { withErrorMapping } from "../../lib/errors";
import { parseInput } from "../../lib/guards";

function otpDeps(): OtpDeps {
  const provider = OTP_PROVIDER.value();
  const isEmulator = isFunctionsEmulator();
  return {
    db: db(),
    auth: adminAuth(),
    sender: createOtpSender(provider, { isEmulator }),
    // The code is returned to the client ONLY in the local emulator with the mock sender.
    exposeDevCode: isEmulator && provider === "mock",
  };
}

/**
 * `auth-requestOtp` — unauthenticated by design (it starts sign-in).
 * Abuse controls: per-phone cooldown/window and per-IP hourly limit; App
 * Check enforcement is switched on in the production-hardening stage.
 */
export const requestOtp = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const input = parseInput(callables.requestOtp.input, request.data);
    return requestOtpFlow(otpDeps(), { phone: input.phone, ip: request.rawRequest.ip ?? "unknown" });
  }),
);

/** `auth-verifyOtp` — exchanges a correct code for a Firebase custom token. */
export const verifyOtp = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const input = parseInput(callables.verifyOtp.input, request.data);
    return verifyOtpFlow(otpDeps(), input);
  }),
);
