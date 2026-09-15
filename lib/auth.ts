import { createClient } from "./supabase/server";

export interface SessionUser {
  email: string;
}

/**
 * Real Supabase Auth session, read from cookies via lib/supabase/server.ts.
 * Uses supabase.auth.getUser() rather than getSession() on purpose — it
 * re-validates the token against Supabase instead of trusting whatever is
 * in the cookie, which is what Supabase's own docs recommend for anything
 * server-side that gates access.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return { email: user.email };
}
