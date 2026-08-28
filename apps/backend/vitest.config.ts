import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@home-service/database": path.resolve(__dirname, "../../packages/database/src/index.ts"),
      "@home-service/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    env: {
      // Test-only defaults so unit tests don't depend on a real .env file —
      // real requests still go through the same env.ts validation.
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://homeservice:homeservice@localhost:5432/homeservice_test?schema=public",
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    },
  },
});
