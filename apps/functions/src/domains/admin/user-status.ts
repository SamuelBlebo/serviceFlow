import { paths } from "@serviceflow/firebase";
import { ConflictError, ForbiddenError, NotFoundError, type SetUserStatusInput, UserStatus } from "@serviceflow/shared";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminActionData, adminActionRef } from "../../lib/audit";

/**
 * Account suspension / reactivation (SERVICEFLOW_MIGRATION_PLAN.md §9.6,
 * fixes legacy D-10). In one transaction: update `users/{uid}.status`, take
 * a technician offline, and write the audit entry. Then, outside Firestore:
 * disable the Auth user and revoke refresh tokens.
 *
 * Idempotent per (admin, requestId): a retry re-applies only the Auth side
 * effects, which are themselves idempotent.
 */
export interface UserStatusDeps {
  db: Firestore;
  auth: Auth;
}

export type TargetStatus = typeof UserStatus.SUSPENDED | typeof UserStatus.ACTIVE;

export async function setUserStatus(
  deps: UserStatusDeps,
  actorUid: string,
  input: SetUserStatusInput,
  target: TargetStatus,
): Promise<{ ok: true; id: string }> {
  if (input.uid === actorUid) {
    throw new ForbiddenError("You can't change the status of your own account.");
  }

  const userRef = deps.db.doc(paths.user(input.uid));
  const technicianRef = deps.db.doc(paths.technician(input.uid));
  const actionRef = adminActionRef(deps.db, actorUid, input.requestId);

  await deps.db.runTransaction(async (tx) => {
    const [action, user, technician] = await Promise.all([tx.get(actionRef), tx.get(userRef), tx.get(technicianRef)]);
    if (action.exists) return; // already applied by an earlier attempt of this request
    if (!user.exists) throw new NotFoundError("User", input.uid);

    const before = user.get("status") as string;
    if (before === target) {
      throw new ConflictError(`This account is already ${target === UserStatus.SUSPENDED ? "suspended" : "active"}.`);
    }

    tx.update(userRef, {
      status: target,
      suspension:
        target === UserStatus.SUSPENDED
          ? { reason: input.reason, byUid: actorUid, at: FieldValue.serverTimestamp() }
          : null,
    });

    if (target === UserStatus.SUSPENDED && technician.exists && technician.get("isOnline") === true) {
      tx.update(technicianRef, { isOnline: false });
    }

    tx.create(
      actionRef,
      adminActionData({
        adminUid: actorUid,
        actionType: target === UserStatus.SUSPENDED ? "USER_SUSPENDED" : "USER_REACTIVATED",
        targetType: "user",
        targetId: input.uid,
        before: { status: before },
        after: { status: target },
        reason: input.reason,
        requestId: input.requestId,
      }),
    );
  });

  // Auth side effects (idempotent). Firestore is already authoritative:
  // guards and rules check users/{uid}.status, so access is blocked even if
  // this step fails and has to be retried.
  await deps.auth.updateUser(input.uid, { disabled: target === UserStatus.SUSPENDED });
  if (target === UserStatus.SUSPENDED) await deps.auth.revokeRefreshTokens(input.uid);

  return { ok: true, id: input.uid };
}
