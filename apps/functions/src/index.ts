/**
 * ServiceFlow Cloud Functions entry point.
 *
 * Exported groups become deployed names "<group>-<name>" (e.g. `system-health`),
 * matching the callable registry in @serviceflow/firebase.
 *
 * Stage 2 (foundation) ships only health checks. Domain callables, webhooks,
 * triggers and schedulers are added stage by stage — see
 * SERVICEFLOW_MIGRATION_PLAN.md §7 / §19.
 */
// Must stay the first import (see lib/global-options.ts).
import "./lib/global-options";
import { health } from "./adapters/callables/health";
import { status } from "./adapters/http/status";

export const system = { health, status };
