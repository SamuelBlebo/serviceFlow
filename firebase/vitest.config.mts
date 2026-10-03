import { defineConfig } from "vitest/config";

// Rules tests share one emulator instance, so files run sequentially.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
