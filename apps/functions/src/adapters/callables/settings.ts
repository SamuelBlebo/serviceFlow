import { callables } from "@serviceflow/firebase";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import {
  createCommissionRule as createCommissionRuleFlow,
  setCommissionRuleActive as setCommissionRuleActiveFlow,
  setServiceAreaActive as setServiceAreaActiveFlow,
  updatePlatformSettings as updatePlatformSettingsFlow,
  upsertServiceArea as upsertServiceAreaFlow,
} from "../../domains/admin/settings";
import { db } from "../../lib/admin";
import { withErrorMapping } from "../../lib/errors";
import { parseInput, requireActiveUser, requireCapability, requireRecentSignIn } from "../../lib/guards";

/*
 * Platform configuration (admin, active account, audited). Settings and
 * commission rules affect money, so they also need a recent sign-in.
 */

export const updatePlatformSettings = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    requireRecentSignIn(request);
    const actor = await requireActiveUser(request, db());
    return updatePlatformSettingsFlow({ db: db() }, actor.uid, parseInput(callables.updatePlatformSettings.input, request.data));
  }),
);

export const createCommissionRule = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    requireRecentSignIn(request);
    const actor = await requireActiveUser(request, db());
    return createCommissionRuleFlow({ db: db() }, actor.uid, parseInput(callables.createCommissionRule.input, request.data));
  }),
);

export const setCommissionRuleActive = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    requireRecentSignIn(request);
    const actor = await requireActiveUser(request, db());
    return setCommissionRuleActiveFlow({ db: db() }, actor.uid, parseInput(callables.setCommissionRuleActive.input, request.data));
  }),
);

export const upsertServiceArea = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    const actor = await requireActiveUser(request, db());
    return upsertServiceAreaFlow({ db: db() }, actor.uid, parseInput(callables.upsertServiceArea.input, request.data));
  }),
);

export const setServiceAreaActive = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    const actor = await requireActiveUser(request, db());
    return setServiceAreaActiveFlow({ db: db() }, actor.uid, parseInput(callables.setServiceAreaActive.input, request.data));
  }),
);
