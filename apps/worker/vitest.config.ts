import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // PGlite startup + migrations take a moment on first use.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Tests must be hermetic: never pick up real credentials from
    // apps/worker/.env (dotenv does not overwrite pre-set variables).
    env: {
      TRANSCRIPTION_PROVIDER: "mock",
      ASSEMBLYAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      ANALYSIS_ENGINE: "",
      SUPABASE_DB_URL: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
