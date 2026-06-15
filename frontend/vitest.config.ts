import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests run in a plain Node environment — the SafeSend helpers under test
// are pure (no DOM). The `@` alias mirrors tsconfig so test imports match app
// imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
