import type { TimestampLike } from "@serviceflow/shared";
import type { z } from "zod";

export type { TimestampLike };

export function isTimestampLike(value: unknown): value is TimestampLike {
  return typeof value === "object" && value !== null && typeof (value as { toMillis?: unknown }).toMillis === "function";
}

export function timestampToDate(ts: TimestampLike): Date {
  return new Date(ts.toMillis());
}

export function timestampToDateOrNull(ts: TimestampLike | null | undefined): Date | null {
  return ts ? timestampToDate(ts) : null;
}

/** A document's data together with its id — the shape every typed hook returns. */
export type WithId<T> = T & { id: string };

/**
 * Parses raw Firestore data against a shared zod schema. Works with a
 * snapshot from any SDK (web, React Native Firebase, Admin) because it only
 * needs `id` and `data()`. Returns null for missing documents; throws a
 * descriptive error if the stored data violates the contract.
 */
export function parseDoc<S extends z.ZodType>(
  schema: S,
  snapshot: { id: string; data(): unknown },
): WithId<z.infer<S>> | null {
  const raw = snapshot.data();
  if (raw === undefined || raw === null) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Document ${snapshot.id} does not match its schema: ${parsed.error.message}`);
  }
  return { ...(parsed.data as z.infer<S> & object), id: snapshot.id };
}

/**
 * Lenient variant for list views: skips (and reports) invalid documents
 * instead of failing the whole list, so one bad record never blanks a screen.
 */
export function parseDocs<S extends z.ZodType>(
  schema: S,
  snapshots: ReadonlyArray<{ id: string; data(): unknown }>,
  onInvalid?: (id: string, error: unknown) => void,
): Array<WithId<z.infer<S>>> {
  const out: Array<WithId<z.infer<S>>> = [];
  for (const snap of snapshots) {
    try {
      const doc = parseDoc(schema, snap);
      if (doc) out.push(doc);
    } catch (error) {
      onInvalid?.(snap.id, error);
    }
  }
  return out;
}
