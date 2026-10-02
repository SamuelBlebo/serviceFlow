import { PreferredTime } from "./enums";

/**
 * Explicit time-zone handling. The legacy backend used the server's local
 * clock (defect D-14) — correct only because Ghana and the server both sit
 * at UTC+0. Business time now always comes from settings/platform.timezone.
 */
export const DEFAULT_TIMEZONE = "Africa/Accra";

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0 = Sunday
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(date: Date, timeZone: string = DEFAULT_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dayOfWeek: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** Day-of-week and "HH:mm" of an instant, in the given time zone — the shape matching needs. */
export function zonedDayAndTime(date: Date, timeZone: string = DEFAULT_TIMEZONE): { dayOfWeek: number; time: string } {
  const p = zonedParts(date, timeZone);
  return { dayOfWeek: p.dayOfWeek, time: `${pad2(p.hour)}:${pad2(p.minute)}` };
}

/**
 * Converts a wall-clock time in `timeZone` to the corresponding UTC instant.
 * Uses the offset the zone has at that moment (handles DST zones correctly
 * for all but the ambiguous hour, which Ghana never has).
 */
export function zonedWallTimeToDate(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const p = zonedParts(new Date(asUtc), timeZone);
  const zoneAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offsetMs = zoneAsUtc - asUtc;
  return new Date(asUtc - offsetMs);
}

/**
 * When a booking is needed, for availability filtering. Ported from the
 * legacy bookings service, with the time zone made explicit. TOMORROW uses
 * the same time tomorrow (legacy used now, so a "tomorrow" job was matched
 * against today's working hours).
 */
export function resolveNeededAt(
  preferredTime: PreferredTime,
  scheduledAt: Date | null | undefined,
  now: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): { dayOfWeek: number; time: string } {
  const reference =
    preferredTime === PreferredTime.SCHEDULED && scheduledAt
      ? scheduledAt
      : preferredTime === PreferredTime.TOMORROW
        ? new Date(now.getTime() + 86_400_000)
        : now;
  return zonedDayAndTime(reference, timeZone);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
