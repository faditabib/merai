import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Only the database connection is required to boot; provider API keys are
 * validated lazily by the handlers that need them so the worker can run
 * before every integration is configured.
 */
export const env = {
  /** Direct Postgres connection string (Supabase → Settings → Database). */
  databaseUrl: required("SUPABASE_DB_URL"),
  supabaseUrl: process.env.SUPABASE_URL ?? null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY ?? null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
  dolbyAppKey: process.env.DOLBY_APP_KEY ?? null,
  dolbyAppSecret: process.env.DOLBY_APP_SECRET ?? null,
  pixabayApiKey: process.env.PIXABAY_API_KEY ?? null,
};

export function requireEnv<K extends keyof typeof env>(key: K): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Environment variable for "${String(key)}" is not set`);
  }
  return value;
}
