import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Refresh the Supabase auth session inside the proxy, writing any rotated
 * tokens onto the outgoing response. Must be awaited on every matched request
 * or server components may see expired sessions.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Allow the app to boot before Supabase is configured (first-run DX);
  // auth-dependent pages will show their own errors.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Triggers a token refresh if the access token has expired.
  await supabase.auth.getUser();

  return response;
}
