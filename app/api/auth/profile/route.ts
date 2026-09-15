import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * Self-service nickname update — uses the cookie-bound client (the caller's
 * own session), not the service role key, so this can only ever change the
 * signed-in person's own metadata, never anyone else's. (Admins editing
 * someone else's nickname go through app/api/admin/users/[id] instead,
 * which does use the service role key.)
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({
    data: { nickname: nickname || null },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ displayName: nickname || user.email });
}
