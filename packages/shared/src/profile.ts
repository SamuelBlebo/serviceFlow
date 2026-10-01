/**
 * Customer profile and address rules (Stage 4), shared by the apps (form
 * validation) and mirrored by Firestore Security Rules (enforcement).
 *
 * Ghana-first addressing: most locations are described by landmarks, so an
 * address is a short label + free-text directions + a service area from the
 * catalogue, with an optional GhanaPost GPS digital address (e.g. GA-543-0125).
 */

export const PROFILE_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  addressLabelMax: 40,
  directionsMin: 5,
  directionsMax: 200,
  notesMax: 300,
  /** Enforced by the apps; rules cannot count subcollection documents. */
  maxSavedAddresses: 10,
} as const;

/**
 * Letters (any script, including Ghanaian letters such as Ɛ and Ɔ), spaces,
 * apostrophes, hyphens and dots — must start with a letter.
 */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;

/** Collapses whitespace; returns null when the name is not acceptable. */
export function normalizePersonName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < PROFILE_LIMITS.nameMin || name.length > PROFILE_LIMITS.nameMax) return null;
  return NAME_PATTERN.test(name) ? name : null;
}

/** First word of a name, for friendly greetings ("Welcome, Ama"). */
export function firstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

const GHANA_POST_GPS = /^([A-Z]{2})-?(\d{3,4})-?(\d{4})$/;

/**
 * Normalizes a GhanaPost GPS digital address to "XX-NNN(N)-NNNN".
 * Accepts lowercase, spaces and missing dashes: "ga 543 0125" -> "GA-543-0125".
 * Returns null if it is not a well-formed digital address.
 */
export function normalizeGhanaPostGps(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s_]/g, "");
  const match = GHANA_POST_GPS.exec(compact);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function isValidGhanaPostGps(input: string): boolean {
  return normalizeGhanaPostGps(input) !== null;
}

/** Suggested address labels; any short custom label is also allowed. */
export const ADDRESS_LABEL_SUGGESTIONS = ["Home", "Work", "Shop", "Family house"] as const;
