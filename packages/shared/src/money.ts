import { ValidationError } from "./errors";

/**
 * Money is always stored and computed as integer minor units (pesewas for
 * GHS). Firestore has no decimal type and floats would slowly corrupt the
 * ledger, so conversion to/from major units happens only at the UI edge.
 */

export const DEFAULT_CURRENCY = "GHS";

const CURRENCY_SYMBOLS: Record<string, string> = { GHS: "GH₵" };

/** GH₵ 12.34 → 1234. Rounds to the nearest minor unit. */
export function toMinor(major: number): number {
  if (!Number.isFinite(major)) throw new ValidationError("Amount must be a finite number");
  return Math.round(major * 100);
}

/** 1234 → 12.34 */
export function fromMinor(minor: number): number {
  return minor / 100;
}

export function isMinorAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function assertMinorAmount(value: number, field = "amount"): void {
  if (!isMinorAmount(value)) {
    throw new ValidationError(`${field} must be a non-negative whole number of minor units (got ${value})`);
  }
}

/**
 * Formats minor units for display, e.g. formatMoney(250000) → "GH₵2,500.00".
 * Implemented without Intl currency data so it renders identically on the
 * web, on React Native (Hermes) and in Cloud Functions.
 */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % 100).toString().padStart(2, "0");
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${negative ? "-" : ""}${symbol}${whole}.${fraction}`;
}

/** "GH₵100.00 – GH₵400.00" for a service's price range. */
export function formatMoneyRange(minMinor: number, maxMinor: number, currency: string = DEFAULT_CURRENCY): string {
  if (minMinor === maxMinor) return formatMoney(minMinor, currency);
  return `${formatMoney(minMinor, currency)} – ${formatMoney(maxMinor, currency)}`;
}
