import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, encodeSession } from "@/lib/auth";

/**
 * FAKE AUTH — see lib/auth.ts. Any non-empty name + any non-empty password
 * is accepted; the password is never checked against anything. This is a
 * deliberate placeholder so the login flow and "who ran this" attribution
 * work end-to-end before Supabase Auth is connected for real.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !password) {
    return NextResponse.json({ error: "Informe nome e senha." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, name });
  res.cookies.set(SESSION_COOKIE, encodeSession({ name }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
