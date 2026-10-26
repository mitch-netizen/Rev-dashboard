import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { APP_KEY, PORTAL_URL, portalLoginUrl, portalNoAccessUrl, supabaseCookieOptions } from "@/lib/auth/portal";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");

  // Shared staff login: sign-in happens on the portal, and the user needs this app.
  if (PORTAL_URL) {
    if (!user) {
      const returnTo = new URL(isAuthRoute ? "/" : request.nextUrl.pathname + request.nextUrl.search, request.nextUrl.origin);
      return NextResponse.redirect(portalLoginUrl(returnTo.toString()));
    }
    // Fails closed: an error (including the check not existing yet) means no access.
    const { data: allowed, error } = await supabase.rpc("has_app", { p_app: APP_KEY });
    if (error || allowed !== true) return NextResponse.redirect(portalNoAccessUrl());
  }

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
