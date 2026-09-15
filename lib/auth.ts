import { createClient } from "./supabase/server";

export type Role = "admin" | "user";

export interface SessionUser {
  id: string;
  email: string;
  /** The nickname if the person set one, otherwise falls back to their email
   *  — what to show anywhere a human-facing name is needed. */
  displayName: string;
  nickname: string | null;
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
 * getUser() call for free instead of a second query. The nickname is the
 * opposite: it lives in `user_metadata`, which the person *can* write
 * themselves (via supabase.auth.updateUser() with their own session,
 * app/api/auth/profile/route.ts) — an admin can also set it for someone
 * else from the Usuários screen, same as it can set role.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const role: Role = user.app_metadata?.role === "admin" ? "admin" : "user";
  const rawNickname = user.user_metadata?.nickname;
  const nickname = typeof rawNickname === "string" && rawNickname.trim() ? rawNickname.trim() : null;
  return { id: user.id, email: user.email, displayName: nickname ?? user.email, nickname, role };
}

/** Throws if there's no logged-in admin — use at the top of any admin-only route. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (user.role !== "admin") throw new Error("Admin access required");
  return user;
}
