/**
 * Delivers one-time sign-in codes (Decision D2). Implementations: mock
 * (emulator only) now; a Ghana SMS aggregator (Hubtel / Arkesel / mNotify)
 * and WhatsApp in later stages. Domain code only ever sees this interface.
 */
export interface OtpMessage {
  /** E.164, e.g. +233241234567 */
  phone: string;
  code: string;
  expiresInSeconds: number;
}

export interface OtpSender {
  readonly id: string;
  send(message: OtpMessage): Promise<void>;
}
