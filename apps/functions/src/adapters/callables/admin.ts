import { callables } from "@serviceflow/firebase";
import { UserStatus } from "@serviceflow/shared";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { type TargetStatus, setUserStatus } from "../../domains/admin/user-status";
import { adminAuth, db } from "../../lib/admin";
import { withErrorMapping } from "../../lib/errors";
import { parseInput, requireActiveUser, requireCapability, requireRecentSignIn } from "../../lib/guards";

function statusCallable(target: TargetStatus, inputSchema: typeof callables.suspendUser.input) {
  return onCall(
    withErrorMapping(async (request: CallableRequest) => {
      requireCapability(request, "admin");
      requireRecentSignIn(request);
      const actor = await requireActiveUser(request, db());
      const input = parseInput(inputSchema, request.data);
      return setUserStatus({ db: db(), auth: adminAuth() }, actor.uid, input, target);
    }),
  );
}

/** `admin-suspendUser` — admin only, recent sign-in, audited. */
export const suspendUser = statusCallable(UserStatus.SUSPENDED, callables.suspendUser.input);

/** `admin-reactivateUser` — admin only, recent sign-in, audited. */
export const reactivateUser = statusCallable(UserStatus.ACTIVE, callables.reactivateUser.input);
