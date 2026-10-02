import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes, uploadString } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Storage rules. Stage 2: deny by default. Stage 6: technician profile photos
 * and private identity documents. Writes check the active account in
 * Firestore, so both emulators are used.
 */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-serviceflow",
    storage: { rules: readFileSync(resolve(__dirname, "../storage.rules"), "utf8") },
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [uid, status] of [["tech1", "ACTIVE"], ["tech2", "ACTIVE"], ["banned", "SUSPENDED"], ["cust1", "ACTIVE"]] as const) {
      await setDoc(doc(ctx.firestore(), `users/${uid}`), { status });
    }
    await uploadString(ref(ctx.storage(), "verifications/tech1/s1/existing.jpg"), "x", "raw", { contentType: "image/jpeg" });
  });
});

const jpeg = (bytes = 1024) => new Uint8Array(bytes);
const meta = (contentType = "image/jpeg") => ({ contentType });
const storageAs = (uid: string, claims: Record<string, unknown> = { tech: true }) => env.authenticatedContext(uid, claims).storage();

describe("deny by default", () => {
  it("unopened prefixes stay closed for everyone, including admins", async () => {
    for (const storage of [env.unauthenticatedContext().storage(), storageAs("tech1"), storageAs("admin1", { admin: true })]) {
      await assertFails(uploadString(ref(storage, "bookings/b1/PROBLEM/leak.jpg"), "x"));
      await assertFails(uploadString(ref(storage, "anything/else.txt"), "x"));
      await assertFails(getBytes(ref(storage, "anything/else.txt")));
    }
  });
});

describe("technician profile photos", () => {
  it("an active technician can upload their own photo; signed-in users can view it", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("tech1"), "technicians/tech1/profile/me.jpg"), jpeg(), meta()));
    await assertSucceeds(getBytes(ref(storageAs("cust1", {}), "technicians/tech1/profile/me.jpg")));
  });

  it("refuses other users' folders, non-technicians, suspended accounts, non-images and oversized files", async () => {
    await assertFails(uploadBytes(ref(storageAs("tech2"), "technicians/tech1/profile/me.jpg"), jpeg(), meta()));
    await assertFails(uploadBytes(ref(storageAs("cust1", {}), "technicians/cust1/profile/me.jpg"), jpeg(), meta()));
    await assertFails(uploadBytes(ref(storageAs("banned"), "technicians/banned/profile/me.jpg"), jpeg(), meta()));
    await assertFails(uploadBytes(ref(storageAs("tech1"), "technicians/tech1/profile/me.pdf"), jpeg(), meta("application/pdf")));
    await assertFails(uploadBytes(ref(storageAs("tech1"), "technicians/tech1/profile/huge.jpg"), jpeg(5 * 1024 * 1024 + 1), meta()));
  });

  it("signed-out visitors cannot view profile photos", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), "technicians/tech1/profile/me.jpg"), "x", "raw", meta());
    });
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), "technicians/tech1/profile/me.jpg")));
  });
});

describe("identity documents (private)", () => {
  it("the technician can upload a new document once", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("tech1"), "verifications/tech1/s2/ghana-card.jpg"), jpeg(), meta()));
  });

  it("documents can't be overwritten from a client", async () => {
    await assertFails(uploadBytes(ref(storageAs("tech1"), "verifications/tech1/s1/existing.jpg"), jpeg(), meta()));
  });

  it("only the owner and admins can read them — never other users or the public", async () => {
    await assertSucceeds(getBytes(ref(storageAs("tech1"), "verifications/tech1/s1/existing.jpg")));
    await assertSucceeds(getBytes(ref(storageAs("admin1", { admin: true }), "verifications/tech1/s1/existing.jpg")));
    await assertFails(getBytes(ref(storageAs("tech2"), "verifications/tech1/s1/existing.jpg")));
    await assertFails(getBytes(ref(storageAs("cust1", {}), "verifications/tech1/s1/existing.jpg")));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), "verifications/tech1/s1/existing.jpg")));
  });

  it("refuses uploads into someone else's folder, by suspended accounts, and non-images", async () => {
    await assertFails(uploadBytes(ref(storageAs("tech2"), "verifications/tech1/s9/id.jpg"), jpeg(), meta()));
    await assertFails(uploadBytes(ref(storageAs("banned"), "verifications/banned/s1/id.jpg"), jpeg(), meta()));
    await assertFails(uploadBytes(ref(storageAs("tech1"), "verifications/tech1/s3/id.txt"), jpeg(), meta("text/plain")));
    await assertFails(uploadBytes(ref(storageAs("tech1"), "verifications/tech1/s3/huge.jpg"), jpeg(8 * 1024 * 1024 + 1), meta()));
  });
});
