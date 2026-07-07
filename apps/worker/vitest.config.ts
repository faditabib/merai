import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // PGlite startup + migrations take a moment on first use.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
