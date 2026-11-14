import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/contract/**/*.test.ts", "lib/**/*.test.ts", "components/**/*.test.tsx"],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
});
