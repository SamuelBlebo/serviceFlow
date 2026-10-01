import { paths } from "@serviceflow/firebase";
import { ForbiddenError, UserStatus, capabilitiesFromClaims } from "@serviceflow/shared";
import type { Auth, UserRecord } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * Account records. One Firebase Auth user per phone number (E.164) and one
 * `users/{uid}` document per Auth user. Phone sign-in creates the account on
 * first use — there is no separate "sign up" step (legacy behaviour kept).
 */

export async function findOrCreateUserByPhone(auth: Auth, e164: string): Promise<{ user: UserRecord; isNew: boolean }> {
  try {
    return { user: await auth.getUserByPhoneNumber(e164), isNew: false };
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
  try {
    return { user: await auth.createUser({ phoneNumber: e164 }), isNew: true };
  } catch (err) {
    // Another request created it between our lookup and create.
    if ((err as { code?: string }).code === "auth/phone-number-already-exists") {
      return { user: await auth.getUserByPhoneNumber(e164), isNew: false };
    }
    throw err;
  }
}

/**
 * Creates `users/{uid}` on first sign-in and refreshes `lastLoginAt` and the
 * capability mirror afterwards. Throws if the account is suspended — checked
 * only AFTER the code is verified, so suspension status can't be probed.
 */
export async function ensureActiveUserDoc(db: Firestore, user: UserRecord, e164: string): Promise<void> {
  const ref = db.doc(paths.user(user.uid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (user.disabled || (snap.exists && snap.get("status") !== UserStatus.ACTIVE)) {
      throw new ForbiddenError("This account has been suspended. Contact ServiceFlow support.");
    }
    const capabilities = capabilitiesFromClaims(user.customClaims);
    if (!snap.exists) {
      tx.create(ref, {
        phone: e164,
        email: user.email ?? null,
        displayName: user.displayName ?? "",
        status: UserStatus.ACTIVE,
        capabilities,
        suspension: null,
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(ref, { capabilities, lastLoginAt: FieldValue.serverTimestamp() });
    }
  });
}
