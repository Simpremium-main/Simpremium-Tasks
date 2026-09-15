import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Informe email e senha." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // AuthApiError means the request reached Supabase and it rejected the
    // credentials — safe to show a generic message (never reveal whether
    // the email exists). Any other error name means the request didn't
    // really complete against Supabase (network/config problem) — worth
    // surfacing distinctly instead of telling someone their password is
    // wrong when the real issue is e.g. a bad SUPABASE_URL.
    const isCredentialsError = error.name === "AuthApiError";
    return NextResponse.json(
      {
        error: isCredentialsError
          ? "Email ou senha incorretos."
          : `Não foi possível falar com o Supabase (${error.name}: ${error.message}). Confira NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.`,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
