import { ShieldAlert, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/adminUsers";
import PageHeader from "@/components/PageHeader";
import UserAdminPanel from "@/components/UserAdminPanel";
import PurgeCacheButton from "@/components/PurgeCacheButton";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    return (
      <div>
        <PageHeader icon={<ShieldAlert size={18} />} title="Acesso restrito" />
        <div className="text-center py-24 animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-lg font-semibold">Só administradores</h2>
          <p className="mt-2 text-ink/60 max-w-sm mx-auto">
            Essa página é só para quem tem função de administrador. Fala com um admin se precisar
            de acesso.
          </p>
        </div>
      </div>
    );
  }

  const users = await listUsers();

  return (
    <div>
      <PageHeader
        icon={<Users size={18} />}
        title="Usuários"
        subtitle={`${users.length} conta${users.length === 1 ? "" : "s"}`}
      />
      <UserAdminPanel initialUsers={users} currentUserId={user.id} />
      <div className="mt-6">
        <PurgeCacheButton />
      </div>
    </div>
  );
}
