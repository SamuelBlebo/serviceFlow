/**
 * Creates (or resets) an administrator in the LOCAL emulators:
 *   pnpm bootstrap:admin                       # admin@serviceflow.dev + generated password
 *   ADMIN_EMAIL=me@x.dev ADMIN_PASSWORD=... pnpm bootstrap:admin
 *
 * Admins are never created by public sign-up (plan §9.1). This is the
 * Firebase replacement for the legacy `bootstrap-admin.ts`. Like the seed it
 * only ever targets the `demo-serviceflow` emulators; a production bootstrap
 * (with MFA enrolment) is added when a real project exists.
 */
import { randomBytes } from "node:crypto";
import { paths } from "@serviceflow/firebase";
import { UserStatus } from "@serviceflow/shared";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { adminActionData, adminActionRef } from "../lib/audit";

const PROJECT_ID = "demo-serviceflow";

function assertEmulatorOnly(): void {
  const declared = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (declared && declared !== PROJECT_ID) {
    throw new Error(`Refusing to run: environment targets project "${declared}", expected "${PROJECT_ID}".`);
  }
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
}

async function main(): Promise<void> {
  assertEmulatorOnly();
  const email = (process.env.ADMIN_EMAIL ?? "admin@serviceflow.dev").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");

  const app = initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    await auth.updateUser(uid, { password, disabled: false, emailVerified: true });
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    uid = (await auth.createUser({ email, password, emailVerified: true, displayName: "ServiceFlow Admin" })).uid;
  }
  await auth.setCustomUserClaims(uid, { admin: true });

  const requestId = `bootstrap_${Date.now()}`;
  const batch = db.batch();
  batch.set(
    db.doc(paths.user(uid)),
    {
      phone: null,
      email,
      displayName: "ServiceFlow Admin",
      status: UserStatus.ACTIVE,
      capabilities: { tech: false, admin: true },
      suspension: null,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  batch.create(
    adminActionRef(db, "bootstrap-script", requestId),
    adminActionData({
      adminUid: "bootstrap-script",
      actionType: "ADMIN_BOOTSTRAPPED",
      targetType: "user",
      targetId: uid,
      after: { admin: true },
      reason: "Local emulator bootstrap",
      requestId,
    }),
  );
  await batch.commit();

  console.log(`Admin ready in ${PROJECT_ID} (emulators):`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${process.env.ADMIN_PASSWORD ? "(from ADMIN_PASSWORD)" : password}`);
  console.log("Sign in at http://localhost:5173/admin/login");
}

main().catch((err) => {
  console.error("Admin bootstrap failed:", err instanceof Error ? err.message : err);
  console.error("Is the emulator suite running? Start it with `pnpm emulators`.");
  process.exitCode = 1;
});
