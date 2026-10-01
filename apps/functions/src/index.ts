/**
 * ServiceFlow Cloud Functions entry point.
 *
 * Exported groups become deployed names "<group>-<name>" (e.g. `auth-requestOtp`),
 * matching the callable registry in @serviceflow/firebase.
 *
 * Implemented: health checks (Stage 2), phone sign-in and account status
 * administration (Stage 3). Further callables, webhooks, triggers and
 * schedulers are added stage by stage — see SERVICEFLOW_MIGRATION_PLAN.md.
 */
// Must stay the first import (see lib/global-options.ts).
import "./lib/global-options";
import { reactivateUser, suspendUser } from "./adapters/callables/admin";
import { requestOtp, verifyOtp } from "./adapters/callables/auth";
import { health } from "./adapters/callables/health";
import { status } from "./adapters/http/status";

export const system = { health, status };
export const auth = { requestOtp, verifyOtp };
export const admin = { suspendUser, reactivateUser };
