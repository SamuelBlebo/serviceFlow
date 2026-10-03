import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@serviceflow/database": path.resolve(__dirname, "../../packages/database/src/index.ts"),
      "@serviceflow/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
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
      DATABASE_URL: "postgresql://serviceflow:serviceflow@localhost:5432/serviceflow_test?schema=public",
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    },
  },
});
