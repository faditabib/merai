import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | null = null;

/** Service-role Supabase client (storage access; bypasses RLS). */
export function getServiceClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      requireEnv("supabaseUrl"),
      requireEnv("supabaseServiceRoleKey"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}

/**
 * Short-lived signed URL for a stored object. storage_path convention:
 * "{bucket}/{owner_id}/…" (see DECISIONS.md — no public buckets, ever).
 */
export async function createSignedMediaUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const slash = storagePath.indexOf("/");
  if (slash <= 0) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }
  const bucket = storagePath.slice(0, slash);
  const objectName = storagePath.slice(slash + 1);

  const { data, error } = await getServiceClient()
    .storage.from(bucket)
    .createSignedUrl(objectName, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to sign storage URL for ${storagePath}: ${error?.message ?? "no URL returned"}`,
    );
  }
  return data.signedUrl;
}
