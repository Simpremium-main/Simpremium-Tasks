import { cookies } from "next/headers";

/**
 * FAKE AUTH — explicitly requested as a placeholder until Supabase Auth is
 * wired up. This does NOT verify a password against anything; any non-empty
 * password is accepted. It exists only so the login screen, "logged in as"
 * attribution in execution history, and route protection have real UI/flow
 * to build against — it provides no actual security. Do not mistake this
 * for access control: anyone who submits the login form gets in.
 *
 * To replace with real auth: swap the checks in app/api/auth/login/route.ts
 * for a real Supabase Auth call, and this cookie-reading helper for
 * Supabase's session/user lookup — everything downstream that calls
 * getCurrentUser() keeps working unchanged.
 */

export const SESSION_COOKIE = "skillshub_fake_session";

export interface SessionUser {
  name: string;
}

export function getCurrentUser(): SessionUser | null {
  const cookieStore = cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (typeof decoded.name === "string" && decoded.name.trim()) {
      return { name: decoded.name };
    }
    return null;
  } catch {
    return null;
  }
}

export function encodeSession(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user), "utf-8").toString("base64url");
}
