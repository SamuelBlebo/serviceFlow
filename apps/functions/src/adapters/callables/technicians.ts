import { callables } from "@serviceflow/firebase";
import { type CallableRequest, onCall } from "firebase-functions/v2/https";
import { registerTechnician, submitVerification, updateTechnicianServices } from "../../domains/technicians/onboarding";
import { reviewTechnician as reviewTechnicianFlow } from "../../domains/technicians/review";
import { adminAuth, bucket, db } from "../../lib/admin";
import { withErrorMapping } from "../../lib/errors";
import { parseInput, requireActiveUser, requireCapability, requireRecentSignIn } from "../../lib/guards";

/** `technicians-register` — any active signed-in user can become a provider. */
export const register = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.registerTechnician.input, request.data);
    return registerTechnician({ db: db(), auth: adminAuth() }, actor.uid, input);
  }),
);

/** `technicians-updateServices` — the technician's own services, areas and availability. */
export const updateServices = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    const { requestId: _requestId, ...input } = parseInput(callables.updateTechnicianServices.input, request.data);
    return updateTechnicianServices({ db: db(), auth: adminAuth() }, actor.uid, input);
  }),
);

/** `technicians-submitVerification` — identity documents for admin review. */
export const submitVerificationCallable = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "tech");
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.submitVerification.input, request.data);
    return submitVerification({ db: db(), auth: adminAuth(), bucket: bucket() }, actor.uid, input);
  }),
);

/** `admin-reviewTechnician` — approve/reject/suspend/reinstate (admin, recent sign-in, audited). */
export const reviewTechnician = onCall(
  withErrorMapping(async (request: CallableRequest) => {
    requireCapability(request, "admin");
    requireRecentSignIn(request);
    const actor = await requireActiveUser(request, db());
    const input = parseInput(callables.reviewTechnician.input, request.data);
    return reviewTechnicianFlow({ db: db() }, actor.uid, input);
  }),
);
