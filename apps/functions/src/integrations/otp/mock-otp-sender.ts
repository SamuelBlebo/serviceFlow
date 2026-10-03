import { logger } from "firebase-functions";
import type { OtpMessage, OtpSender } from "./otp-sender";

/**
 * Emulator-only sender: logs the code instead of sending an SMS. The factory
 * refuses to create it outside the Functions emulator, so codes can never end
 * up in production logs.
 */
export class MockOtpSender implements OtpSender {
  readonly id = "mock";
  readonly sent: OtpMessage[] = [];

  async send(message: OtpMessage): Promise<void> {
    this.sent.push(message);
    logger.info(`[MOCK OTP] ${message.phone} → ${message.code} (expires in ${message.expiresInSeconds}s)`);
  }
}
