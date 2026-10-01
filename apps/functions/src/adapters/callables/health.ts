import { callables } from "@serviceflow/firebase";
import type { HealthOutput } from "@serviceflow/shared";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { SERVICE_NAME } from "../../lib/config";
import { withErrorMapping } from "../../lib/errors";
import { parseInput } from "../../lib/guards";

/** Pure handler — unit-tested without the emulator. */
export async function healthHandler(data: unknown, now: Date = new Date()): Promise<HealthOutput> {
  parseInput(callables.health.input, data);
  return { status: "ok", service: SERVICE_NAME, time: now.toISOString() };
}

/**
 * `system-health` callable: proves the client → Functions path (auth
 * headers, App Check later, error mapping) end to end. Needs no sign-in.
 */
export const health = onCall(withErrorMapping(async (request: CallableRequest) => healthHandler(request.data)));
