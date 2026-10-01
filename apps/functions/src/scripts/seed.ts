/**
 * Seeds the LOCAL Firebase emulators with development data:
 *   pnpm emulators   (terminal 1)
 *   pnpm seed        (terminal 2)
 *
 * Safety: this script can only ever reach the emulators. It forces the
 * `demo-serviceflow` project (the `demo-` prefix means Firebase never routes
 * to real resources) and points the Admin SDK at the local emulator hosts.
 * It refuses to run if the environment names any other project.
 *
 * Idempotent: re-running overwrites the same documents and users.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { paths } from "@serviceflow/firebase";
import {
  FEATURE_FLAGS,
  PLATFORM_SETTINGS,
  SERVICES,
  SERVICE_AREAS,
  type SeedAccount,
  customerAccounts,
  globalCommissionRule,
  technicianAccounts,
} from "./seed-data";

const PROJECT_ID = "demo-serviceflow";

function assertEmulatorOnly(): void {
  const declared = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (declared && declared !== PROJECT_ID) {
    throw new Error(`Refusing to seed: environment targets project "${declared}", expected "${PROJECT_ID}".`);
  }
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID; // avoids a GCE metadata lookup
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
}

async function main(): Promise<void> {
  assertEmulatorOnly();
  const app = initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app);
  const auth = getAuth(app);
  const now = Timestamp.now();

  const batch = db.batch();
  for (const { id, doc } of SERVICES) batch.set(db.doc(paths.service(id)), doc);
  for (const { id, doc } of SERVICE_AREAS) batch.set(db.doc(paths.serviceArea(id)), doc);
  batch.set(db.doc(paths.platformSettings()), PLATFORM_SETTINGS);
  batch.set(db.doc(paths.featureFlags()), FEATURE_FLAGS);
  const rule = globalCommissionRule(now);
  batch.set(db.doc(paths.commissionRule(rule.id)), rule.doc);

  const technicians = technicianAccounts(now);
  const customers = customerAccounts(now);

  for (const account of technicians) {
    batch.set(db.doc(paths.user(account.uid)), account.user);
    batch.set(db.doc(paths.technician(account.uid)), account.profile);
    batch.set(db.doc(paths.wallet(account.uid)), account.wallet);
  }
  for (const account of customers) {
    batch.set(db.doc(paths.user(account.uid)), account.user);
    batch.set(db.doc(paths.customer(account.uid)), account.profile);
    for (const address of account.addresses) {
      batch.set(db.doc(paths.customerAddress(account.uid, address.id)), address.doc);
    }
  }
  await batch.commit();

  for (const account of [...technicians, ...customers] as Array<SeedAccount<unknown>>) {
    await upsertAuthUser(auth, account);
  }

  console.log(
    `Seeded ${SERVICES.length} services, ${SERVICE_AREAS.length} service areas, settings, 1 commission rule, ` +
      `${technicians.length} technicians and ${customers.length} customer into ${PROJECT_ID} (emulators).`,
  );
}

async function upsertAuthUser(auth: ReturnType<typeof getAuth>, account: SeedAccount<unknown>): Promise<void> {
  const props = { phoneNumber: account.phone, displayName: account.user.displayName };
  try {
    await auth.updateUser(account.uid, props);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    await auth.createUser({ uid: account.uid, ...props });
  }
  await auth.setCustomUserClaims(account.uid, account.claims);
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  console.error("Is the emulator suite running? Start it with `pnpm emulators`.");
  process.exitCode = 1;
});
