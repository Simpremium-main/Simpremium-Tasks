import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Gates every page behind a real Supabase Auth session. Static assets, the
// login page itself, the auth API routes, and a shared skill's public
// /share/<token> view stay open so the login flow (and the whole point of
// a share link — no login required) can actually run. Follows Supabase's
// documented middleware pattern: re-validate (and refresh, if needed) the
// session on every request, since a stale/expired cookie should bounce
// back to /login just like no cookie at all.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

// Routes that authenticate themselves with their own bearer token
// (CRON_SECRET, COWORK_AGENT_TOKEN — see their own route handlers) instead
// of a logged-in browser session, because their caller isn't a browser at
// all: Vercel Cron, or the Mac mini agent. Without this exclusion, this
// middleware's own session check ran *first* and 307-redirected every such
// request to /login before the route handler (and its real token check)
// ever ran — silently breaking both scheduled-skill cron runs and Cowork
// agent dispatch. Every other /api/* route stays behind the normal session
// gate below; only these two prefixes skip it.
const TOKEN_AUTHENTICATED_API_PREFIXES = ["/api/cron/", "/api/cowork-agent/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/share/") ||
    TOKEN_AUTHENTICATED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
