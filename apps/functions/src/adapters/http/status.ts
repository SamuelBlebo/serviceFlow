import { onRequest } from "firebase-functions/v2/https";
import { SERVICE_NAME } from "../../lib/config";

/** Minimal request/response shape so the handler is testable without Express. */
export interface StatusRequest {
  method: string;
}
export interface StatusResponse {
  status(code: number): StatusResponse;
  set(field: string, value: string): StatusResponse;
  json(body: unknown): void;
}

export function statusHandler(req: StatusRequest, res: StatusResponse, now: Date = new Date()): void {
  if (req.method !== "GET") {
    res.status(405).set("Allow", "GET").json({ error: { code: "METHOD_NOT_ALLOWED" } });
    return;
  }
  res.status(200).set("Cache-Control", "no-store").json({ status: "ok", service: SERVICE_NAME, time: now.toISOString() });
}

/**
 * `system-status` HTTP endpoint for uptime checks (plain GET, no SDK). The
 * callable health check is `system-health`; they are separate functions
 * because a callable and an HTTP function cannot share a name.
 */
export const status = onRequest((req, res) => statusHandler(req, res));
