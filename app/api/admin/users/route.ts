import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createUser, listUsers } from "@/lib/adminUsers";

export async function GET() {
  try {
    await requireAdmin();
    const users = await listUsers();
    return NextResponse.json(users);
  } catch (err) {
    return adminError(err, "GET /api/admin/users failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "admin" ? "admin" : "user";
    const nickname = typeof body.nickname === "string" && body.nickname.trim() ? body.nickname.trim() : null;

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
    }

    const user = await createUser({ email, password, role, nickname });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return adminError(err, "POST /api/admin/users failed");
  }
}

function adminError(err: unknown, context: string) {
  console.error(`${context}:`, err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  const status = message.includes("Admin access required") || message.includes("Not signed in") ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}
