import { z } from "zod";
import { isMinorAmount } from "../money";
import { isValidGhanaPhone } from "../phone";
import { normalizePersonName } from "../profile";

/**
 * Structural timestamp type. Firestore Timestamps from the web SDK, React
 * Native Firebase and the Admin SDK all satisfy it, so shared code never has
 * to import any of them.
 */
export interface TimestampLike {
  toMillis(): number;
}

export const timestampLike = z.custom<TimestampLike>(
  (v) => typeof v === "object" && v !== null && typeof (v as { toMillis?: unknown }).toMillis === "function",
  { message: "Expected a Firestore Timestamp" },
);

export const minorAmount = z.number().refine(isMinorAmount, { message: "Must be a whole number of minor units (pesewas)" });

export const percent = z.number().min(0).max(100);

export const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const ghanaPhone = z.string().refine(isValidGhanaPhone, { message: "Enter a valid Ghanaian phone number" });

/** "HH:mm", 24h. */
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");

/**
 * Client-generated idempotency key sent with every mutating callable, so a
 * retry after a network timeout never performs the action twice.
 */
export const requestId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const docId = z.string().min(1).max(128).regex(/^[^/]+$/, "Invalid document id");

/** A person's name: trimmed, single-spaced, 2-80 letters (any script). */
export const personName = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .refine((v) => normalizePersonName(v) === v, { message: "Enter your name using letters only (2-80 characters)" });
