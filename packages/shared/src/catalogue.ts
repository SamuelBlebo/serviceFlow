/**
 * Service catalogue rules (Stage 5). Services are admin-managed data, never
 * hard-coded: adding "Cleaning" is a callable, not a deploy.
 *
 * A service's id is its slug (e.g. "ac-repair-maintenance"). It is fixed at
 * creation because bookings, technicians and commission rules reference it.
 */
export const SERVICE_LIMITS = {
  nameMin: 2,
  nameMax: 60,
  descriptionMax: 300,
  /** Sanity ceiling for a typical-price range: GH₵100,000. */
  maxPriceMinor: 10_000_000,
  sortOrderMax: 999,
} as const;

/**
 * URL-friendly id from a service name:
 * "AC Repair & Maintenance" -> "ac-repair-and-maintenance".
 * Accents are stripped; anything else non-alphanumeric becomes a hyphen.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Case- and spacing-insensitive key used to keep service names unique. */
export function serviceNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
