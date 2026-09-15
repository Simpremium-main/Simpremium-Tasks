import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers, and Server
 * Actions — bound to the request's cookies via the anon key, so it acts as
 * whichever user is logged in (unlike lib/supabaseClient.ts, which uses the
 * service role key and bypasses auth entirely for app data).
 *
 * In a Server Component, cookies() is read-only, so `set`/`remove` below
 * are no-ops there — that's fine because the session's refresh is handled
 * by middleware.ts on every request, not by the component render itself.
 * In a Route Handler (like the login/logout routes), cookies() can be
 * mutated, so signing in/out here does update the browser's session
 * cookies directly.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component — cookies() is read-only here.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Server Component — cookies() is read-only here.
          }
        },
      },
    }
  );
}
