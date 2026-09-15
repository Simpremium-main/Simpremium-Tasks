import { createClient } from "./supabase/server";

export type Role = "admin" | "user";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * Real Supabase Auth session, read from cookies via lib/supabase/server.ts.
 * Uses supabase.auth.getUser() rather than getSession() on purpose — it
 * re-validates the token against Supabase instead of trusting whatever is
 * in the cookie, which is what Supabase's own docs recommend for anything
 * server-side that gates access.
 *
 * Role lives in Supabase Auth's own `app_metadata` (not a separate table) —
 * it's only ever settable by the service role key (never the user
 * themselves, unlike `user_metadata`), which is exactly the "only an admin
 * can change this" property we need, and it comes back on this same
 * getUser() call for free instead of a second query.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const role: Role = user.app_metadata?.role === "admin" ? "admin" : "user";
  return { id: user.id, email: user.email, role };
}

/** Throws if there's no logged-in admin — use at the top of any admin-only route. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (user.role !== "admin") throw new Error("Admin access required");
  return user;
}
