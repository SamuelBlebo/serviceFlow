import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadString } from "firebase/storage";
import { afterAll, beforeAll, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-serviceflow",
    storage: { rules: readFileSync(resolve(__dirname, "../storage.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe("storage — deny by default in Stage 2", () => {
  const paths = [
    "technicians/tech1/profile/me.jpg",
    "verifications/tech1/s1/ghana-card.jpg",
    "bookings/b1/PROBLEM/leak.jpg",
    "anything/else.txt",
  ];

  it("signed-out users can neither upload nor download", async () => {
    const storage = env.unauthenticatedContext().storage();
    for (const p of paths) {
      await assertFails(uploadString(ref(storage, p), "x"));
      await assertFails(getBytes(ref(storage, p)));
    }
  });

  it("even the owner cannot upload to their own prefix until that stage opens it", async () => {
    const storage = env.authenticatedContext("tech1", { tech: true }).storage();
    await assertFails(uploadString(ref(storage, "technicians/tech1/profile/me.jpg"), "x"));
    await assertFails(uploadString(ref(storage, "verifications/tech1/s1/id.jpg"), "x"));
  });

  it("verification documents are never readable by other users", async () => {
    const storage = env.authenticatedContext("someone-else").storage();
    await assertFails(getBytes(ref(storage, "verifications/tech1/s1/ghana-card.jpg")));
  });
});
