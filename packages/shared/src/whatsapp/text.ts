import { DEFAULT_TIMEZONE, zonedParts, zonedWallTimeToDate } from "../time";

/**
 * Pure WhatsApp conversation text/parsing, ported from the legacy
 * conversation handlers. Handler orchestration moves to Cloud Functions in
 * the WhatsApp stage; only the side-effect-free parts live here.
 */

export interface ServiceMenuItem {
  index: number;
  serviceId: string;
  name: string;
}

export function serviceMenuText(menu: readonly ServiceMenuItem[]): string {
  const lines = menu.map((item) => `${item.index}️⃣ ${item.name}`);
  return `👋 Welcome to ServiceFlow.\n\nWhat service do you need?\n\n${lines.join("\n")}`;
}

export function timeMenuText(): string {
  return "When do you need the technician?\n\n1️⃣ ASAP\n2️⃣ Today\n3️⃣ Tomorrow\n4️⃣ Choose a time";
}

/** Interactive reply id or trimmed text — whichever the customer sent. */
export function selectionFrom(inbound: { text?: string; interactiveId?: string }): string | undefined {
  return inbound.interactiveId ?? inbound.text?.trim();
}

/**
 * Parses "DD/MM HH:mm" as wall-clock time in the platform time zone. A date
 * already in the past rolls forward one year (e.g. "05/01" typed in December).
 */
export function parseCustomTime(
  input: string,
  opts: { now?: Date; timeZone?: string } = {},
): Date | null {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? DEFAULT_TIMEZONE;

  const match = /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, dd, mm, hh, min] = match.map(Number) as [number, number, number, number, number];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || min > 59) return null;

  const { year } = zonedParts(now, timeZone);
  let candidate = zonedWallTimeToDate({ year, month: mm, day: dd, hour: hh, minute: min }, timeZone);

  // Reject impossible dates like 31/02 rather than silently rolling into March.
  const check = zonedParts(candidate, timeZone);
  if (check.day !== dd || check.month !== mm) return null;

  if (candidate < now) {
    candidate = zonedWallTimeToDate({ year: year + 1, month: mm, day: dd, hour: hh, minute: min }, timeZone);
  }
  return candidate;
}
