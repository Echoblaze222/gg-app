import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database tests run against a real PostgreSQL named by TEST_DATABASE_URL.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
