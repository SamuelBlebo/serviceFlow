import { MockOtpSender } from "./mock-otp-sender";
import type { OtpSender } from "./otp-sender";

/** The ONLY place an OTP provider is chosen. */
export function createOtpSender(providerId: string, opts: { isEmulator: boolean }): OtpSender {
  switch (providerId) {
    case "mock":
      if (!opts.isEmulator) {
        throw new Error("OTP_PROVIDER=mock is only allowed in the Functions emulator. Configure a real SMS provider.");
      }
      return new MockOtpSender();
    default:
      throw new Error(`OTP provider "${providerId}" is not implemented yet — add an adapter in integrations/otp/`);
  }
}
