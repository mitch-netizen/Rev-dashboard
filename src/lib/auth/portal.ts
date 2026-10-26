/**
 * Shared staff login (apps.queensgladstone.au).
 *
 * When NEXT_PUBLIC_PORTAL_URL is set, signing in happens once on the portal
 * and the Supabase session cookie is shared across every staff app via
 * NEXT_PUBLIC_AUTH_COOKIE_DOMAIN (".apps.queensgladstone.au"). Each app
 * still checks that the user has been given *this* app (public.has_app),
 * and RLS enforces the same thing in the database.
 *
 * Leave both unset to keep this app's own /login page.
 */
export const APP_KEY = "revenue";

export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, "") || null;

export const AUTH_COOKIE_DOMAIN = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN || undefined;

/** Passed to every @supabase/ssr client so they all read and write the same cookie. */
export const supabaseCookieOptions = AUTH_COOKIE_DOMAIN
  ? { domain: AUTH_COOKIE_DOMAIN, path: "/", sameSite: "lax" as const, secure: true }
  : undefined;

export function portalLoginUrl(returnTo: string): string {
  return `${PORTAL_URL}/login?next=${encodeURIComponent(returnTo)}`;
}

export function portalNoAccessUrl(): string {
  return `${PORTAL_URL}/?denied=${APP_KEY}`;
}

/**
 * Only same-site relative paths are allowed as a post-login destination.
 * Rejects "//evil.com", "/\\evil.com" and anything not starting with "/".
 */
export function safeNextPath(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
