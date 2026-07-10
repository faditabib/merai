import "dotenv/config";

/**
 * All values are optional at import time and validated lazily where used
 * (getDb() for the database, requireEnv() in handlers for provider keys) so
 * the module graph is importable in tests without a full environment.
 */
export const env = {
  /** Direct Postgres connection string (Supabase → Settings → Database). */
  databaseUrl: process.env.SUPABASE_DB_URL ?? null,
  supabaseUrl: process.env.SUPABASE_URL ?? null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY ?? null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
  /** Managed render provider (Very Good FFmpeg); local ffmpeg when absent. */
  verygoodFfmpegApiKey: process.env.VERYGOODFFMPEG_API_KEY ?? null,
  /** ffmpeg binary for the local render engine. */
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  /** Ops webhook (Slack/Discord-compatible) for permanent-failure alerts. */
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? null,
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
