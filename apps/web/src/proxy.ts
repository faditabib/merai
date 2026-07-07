import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/session";

const handleI18nRouting = createIntlMiddleware(routing);

/**
 * Next.js 16 proxy (successor of middleware): locale routing first, then
 * Supabase auth-token refresh piggybacked on the same response so refreshed
 * cookies reach the browser.
 */
export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  return updateSession(request, response);
}

export const config = {
  // Skip API routes, the locale-less auth callback, static assets and files.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
