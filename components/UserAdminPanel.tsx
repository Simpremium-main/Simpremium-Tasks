"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Key,
  Loader2,
  Plus,
  Shield,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";

export interface AdminUserItem {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  lastSignInAt: string | null;
}

export default function UserAdminPanel({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUserItem[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [showCreate, setShowCreate] = useState(false);
  const [passwordFor, setPasswordFor] = useState<AdminUserItem | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminUserItem | null>(null);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function handleRoleChange(user: AdminUserItem, role: "admin" | "user") {
    setRoleSaving(user.id);
    setListError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao atualizar (HTTP ${res.status})`);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? body : u)));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Falha ao atualizar a função");
    } finally {
      setRoleSaving(null);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3.5 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          <Plus size={15} />
          Novo usuário
        </button>
      </div>

      {listError && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {listError}
        </div>
      )}

      <div className="rounded-xl border border-line bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Função</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Criado em</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Último acesso</th>
              <th className="px-4 py-2.5 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <tr key={user.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <UserIcon size={13} />
                      </span>
                      <span className="truncate">{user.email}</span>
                      {isSelf && <span className="shrink-0 text-xs text-muted">(você)</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={isSelf || roleSaving === user.id}
                      onChange={(e) => handleRoleChange(user, e.target.value as "admin" | "user")}
                      title={isSelf ? "Não é possível alterar sua própria função" : undefined}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70 ${
                        user.role === "admin"
                          ? "border-primary/30 bg-primary-soft text-primary"
                          : "border-line bg-canvas text-ink/70"
                      }`}
                    >
                      <option value="user">usuário</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted text-xs">
                    {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted text-xs">
                    {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString("pt-BR") : "nunca"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPasswordFor(user)}
                        title="Redefinir senha"
                        className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1.5 text-xs text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
                      >
                        <Key size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteFor(user)}
                        disabled={isSelf}
                        title={isSelf ? "Não é possível excluir sua própria conta" : "Excluir usuário"}
                        className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted disabled:hover:bg-transparent"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(user) => {
            setUsers((prev) => [...prev, user].sort((a, b) => a.email.localeCompare(b.email)));
            setShowCreate(false);
          }}
        />
      )}

      {passwordFor && (
        <ResetPasswordModal
          user={passwordFor}
          onClose={() => setPasswordFor(null)}
        />
      )}

      {deleteFor && (
        <DeleteUserModal
          user={deleteFor}
          onClose={() => setDeleteFor(null)}
          onDeleted={(id) => {
            setUsers((prev) => prev.filter((u) => u.id !== id));
            setDeleteFor(null);
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: AdminUserItem) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao criar (HTTP ${res.status})`);
      onCreated(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={saving ? () => {} : onClose} icon={<Plus size={16} />} title="Novo usuário">
      <div className="space-y-3">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com"
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
        </Field>
        <Field label="Senha provisória" helpText="Pelo menos 8 caracteres — a pessoa pode trocar depois de entrar.">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha inicial"
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
        </Field>
        <Field label="Função">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "user")}
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="user">Usuário</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </div>
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      <ModalActions
        onCancel={onClose}
        onConfirm={handleCreate}
        confirmLabel="Criar usuário"
        confirmingLabel="Criando…"
        confirming={saving}
        disabled={!email.trim() || password.length < 8}
      />
    </ModalShell>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUserItem; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao redefinir (HTTP ${res.status})`);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao redefinir a senha");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} icon={<Key size={16} />} title={`Redefinir senha de ${user.email}`}>
      {done ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
          Senha atualizada. Avisa a pessoa pra trocar no próximo login.
        </p>
      ) : (
        <>
          <Field label="Nova senha" helpText="Pelo menos 8 caracteres.">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nova senha"
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
            />
          </Field>
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <ModalActions
            onCancel={onClose}
            onConfirm={handleSave}
            confirmLabel="Salvar"
            confirmingLabel="Salvando…"
            confirming={saving}
            disabled={password.length < 8}
          />
        </>
      )}
    </ModalShell>
  );
}

function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUserItem;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao excluir (HTTP ${res.status})`);
      onDeleted(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir o usuário");
      setDeleting(false);
    }
  }

  return (
    <ModalShell onClose={deleting ? () => {} : onClose} icon={<AlertTriangle size={16} />} title={`Excluir ${user.email}?`} tone="danger">
      <p className="text-sm text-muted">
        A pessoa perde o acesso ao painel imediatamente. As skills e execuções que ela já rodou
        continuam no histórico — só a conta de login é removida. Não dá pra desfazer.
      </p>
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={deleting}
          className="rounded-md px-3 py-1.5 text-sm border border-line hover:bg-canvas transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 text-white px-3.5 py-1.5 text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {deleting ? "Excluindo…" : "Excluir"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  onClose,
  icon,
  title,
  tone = "primary",
  children,
}: {
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  tone?: "primary" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-line max-w-md w-full p-5 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 mb-1">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              tone === "danger" ? "bg-red-50 text-red-600" : "bg-primary-soft text-primary"
            }`}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-ink truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted hover:text-ink rounded-md p-1 hover:bg-canvas transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  helpText,
  children,
}: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-1">
        <Shield size={12} className="text-muted" />
        {label}
      </label>
      {children}
      {helpText && <p className="text-xs text-muted mt-1">{helpText}</p>}
    </div>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmingLabel,
  confirming,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmingLabel: string;
  confirming: boolean;
  disabled: boolean;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={confirming}
        className="rounded-md px-3 py-1.5 text-sm border border-line hover:bg-canvas transition-colors"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirming || disabled}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3.5 py-1.5 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 transition-colors"
      >
        {confirming && <Loader2 size={14} className="animate-spin" />}
        {confirming ? confirmingLabel : confirmLabel}
      </button>
    </div>
  );
}
