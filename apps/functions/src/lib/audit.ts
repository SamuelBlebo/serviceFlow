import { COLLECTIONS } from "@serviceflow/firebase";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";

/**
 * Immutable admin audit log (`adminActions`). Every privileged action writes
 * one entry in the same transaction as the change it records.
 *
 * The document id is `<actorUid>_<requestId>`, so a client retrying the same
 * request finds the existing entry instead of applying the action twice.
 */
export interface AdminActionEntry {
  adminUid: string;
  actionType: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId: string;
}

export function adminActionRef(db: Firestore, actorUid: string, requestId: string): DocumentReference {
  return db.collection(COLLECTIONS.adminActions).doc(`${actorUid}_${requestId}`);
}

export function adminActionData(entry: AdminActionEntry) {
  return {
    adminUid: entry.adminUid,
    actionType: entry.actionType,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    requestId: entry.requestId,
    createdAt: FieldValue.serverTimestamp(),
  };
}
