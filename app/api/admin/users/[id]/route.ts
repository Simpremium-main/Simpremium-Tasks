import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteUser, updateUser } from "@/lib/adminUsers";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();

    const patch: { role?: "admin" | "user"; password?: string; nickname?: string | null } = {};
    if (body.role === "admin" || body.role === "user") {
      // An admin can't demote themselves through this screen — avoids
      // accidentally locking the only admin account out of user management.
      if (body.role === "user" && params.id === admin.id) {
        return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
      }
      patch.role = body.role;
    }
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 8) {
        return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
      }
      patch.password = body.password;
    }
    if (typeof body.nickname === "string") {
      patch.nickname = body.nickname.trim() || null;
    }

    const user = await updateUser(params.id, patch);
    return NextResponse.json(user);
  } catch (err) {
    return adminError(err, `PATCH /api/admin/users/${params.id} failed`);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    if (params.id === admin.id) {
      return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
    }
    await deleteUser(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError(err, `DELETE /api/admin/users/${params.id} failed`);
  }
}

function adminError(err: unknown, context: string) {
  console.error(`${context}:`, err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  const status = message.includes("Admin access required") || message.includes("Not signed in") ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}
