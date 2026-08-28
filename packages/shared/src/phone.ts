/**
 * Ghana-first phone number handling. Accepts common local input formats
 * ("024 123 4567", "0241234567", "+233241234567", "233241234567") and
 * normalizes to E.164 ("+233241234567") for storage and WhatsApp addressing.
 *
 * Ghanaian mobile numbers: 0 + 9 digits locally, i.e. 10 digits total
 * starting with 0; the network prefix (24, 20, 27, 50, 54, 55, 59, ...)
 * follows. We validate length/shape, not carrier-prefix allowlists, so the
 * system doesn't need updating every time a new range is issued.
 */
export function normalizeGhanaPhone(input: string): string | null {
  const digitsOnly = input.replace(/[^\d+]/g, "");

  let national: string | null = null;

  if (/^\+233\d{9}$/.test(digitsOnly)) {
    national = digitsOnly.slice(4);
  } else if (/^233\d{9}$/.test(digitsOnly)) {
    national = digitsOnly.slice(3);
  } else if (/^0\d{9}$/.test(digitsOnly)) {
    national = digitsOnly.slice(1);
  } else if (/^\d{9}$/.test(digitsOnly)) {
    national = digitsOnly;
  }

  if (!national) return null;
  return `+233${national}`;
}

export function isValidGhanaPhone(input: string): boolean {
  return normalizeGhanaPhone(input) !== null;
}

export function formatGhanaPhoneForDisplay(e164: string): string {
  const match = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `0${match[1]} ${match[2]} ${match[3]}`;
}
