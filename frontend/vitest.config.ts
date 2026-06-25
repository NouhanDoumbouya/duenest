import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests run in a plain Node environment by default — most helpers under
// test are pure (no DOM). Component render tests (`.test.tsx`) opt into a jsdom
// DOM per-file with a `// @vitest-environment jsdom` docblock at the top of the
// file, so we don't pay for a DOM where it isn't needed. The `@` alias mirrors
// tsconfig so test imports match app imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
