import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Emulator-backed tests run separately: pnpm test:integration
    exclude: ["src/**/*.int.test.ts", "**/node_modules/**"],
  },
});
