import { getSupabase } from "./supabaseClient";
import type { Role } from "./auth";

/**
 * User management for admins — every function here goes through the
 * service role client's `auth.admin.*` API (same client, same key, as
 * every other server-side Supabase call in this app), so it bypasses no
 * additional permission layer beyond "only reachable from an admin-gated
 * API route" (see app/api/admin/users/*). Role lives in `app_metadata`,
 * which only the service role key can write — a normal user can never
 * grant themselves admin, even if they could reach one of these calls.
 */

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  lastSignInAt: string | null;
}

function mapUser(user: {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  created_at: string;
  last_sign_in_at?: string | null;
}): AdminUser {
  return {
    id: user.id,
    email: user.email ?? "",
    role: user.app_metadata?.role === "admin" ? "admin" : "user",
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

export async function listUsers(): Promise<AdminUser[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.map(mapUser).sort((a, b) => a.email.localeCompare(b.email));
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
}

export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: { role: input.role },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  return mapUser(data.user);
}

export interface UpdateUserInput {
  role?: Role;
  password?: string;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AdminUser> {
  const supabase = getSupabase();
  const attrs: { app_metadata?: { role: Role }; password?: string } = {};
  if (input.role) attrs.app_metadata = { role: input.role };
  if (input.password) attrs.password = input.password;

  const { data, error } = await supabase.auth.admin.updateUserById(id, attrs);
  if (error) throw new Error(`updateUser: ${error.message}`);
  return mapUser(data.user);
}

export async function deleteUser(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw new Error(`deleteUser: ${error.message}`);
}
