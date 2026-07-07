import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for Client Components (browser). */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see apps/web/.env.example).",
    );
  }
  return createBrowserClient(url, key);
}
