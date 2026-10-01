import { defineConfig } from "vitest/config";

// Runs against the Auth + Firestore emulators (started by `pnpm test:integration`
// at the repo root via `firebase emulators:exec`). Files share the emulators,
// so they run one at a time.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
