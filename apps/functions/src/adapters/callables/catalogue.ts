import { callables } from "@serviceflow/firebase";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { setServiceActive as setServiceActiveFlow, upsertService as upsertServiceFlow } from "../../domains/catalogue/services";
import { db } from "../../lib/admin";
import { withErrorMapping } from "../../lib/errors";
import { parseInput, requireActiveUser, requireCapability } from "../../lib/guards";

/** `admin-upsertService` — create or edit a catalogue service (admin, active account, audited). */
export const upsertService = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.upsertService.input, request.data);
    return upsertServiceFlow({ db: db() }, actor.uid, input);
  }),
);

/** `admin-setServiceActive` — hide or re-show a service (admin, active account, audited). */
export const setServiceActive = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.setServiceActive.input, request.data);
    return setServiceActiveFlow({ db: db() }, actor.uid, input);
  }),
);
