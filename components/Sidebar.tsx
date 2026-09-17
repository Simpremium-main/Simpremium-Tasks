"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Bot,
  CalendarClock,
  History,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  User,
  X,
  Zap,
  LayoutGrid,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { OPEN_EVENT as OPEN_COMMAND_PALETTE_EVENT } from "./CommandPalette";

export interface SidebarSkill {
  id: string;
  name: string;
  status: string;
  needsInput: boolean;
  usesCowork: boolean;
  group: string | null;
}

const STORAGE_KEY = "skills-hub:sidebar-collapsed";
const UNGROUPED_LABEL = "Sem grupo";

export default function Sidebar({
  skills,
  archivedCount,
  userDisplayName,
  userNickname,
  isAdmin,
}: {
  skills: SidebarSkill[];
  archivedCount: number;
  userDisplayName: string | null;
  userNickname: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCollapsed(stored === "1");
    } catch {
      // localStorage unavailable — keep default (expanded)
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const filteredSkills = useMemo(() => {
    if (!query.trim()) return skills;
    const q = query.trim().toLowerCase();
    return skills.filter((s) => s.name.toLowerCase().includes(q));
  }, [skills, query]);

  const groups = useMemo(() => {
    const map = new Map<string, SidebarSkill[]>();
    for (const skill of filteredSkills) {
      const key = skill.group?.trim() || UNGROUPED_LABEL;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(skill);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNGROUPED_LABEL) return 1;
      if (b === UNGROUPED_LABEL) return -1;
      return a.localeCompare(b);
    });
  }, [filteredSkills]);

  // On mobile the drawer always opens fully expanded, regardless of the
  // desktop collapse toggle (which is hidden on mobile anyway) — otherwise
  // a previously-collapsed desktop state would open an empty-looking drawer.
  const effectiveCollapsed = collapsed && !mobileOpen;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        title="Abrir menu"
        className="lg:hidden fixed top-3 left-3 z-30 flex h-9 w-9 items-center justify-center rounded-md bg-sidebar text-white shadow-md border border-sidebar-border"
      >
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30 animate-backdrop-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[264px] flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:static lg:translate-x-0 lg:transition-[width] lg:shrink-0 ${
          collapsed ? "lg:w-[72px]" : "lg:w-[264px]"
        } ${mounted ? "" : "duration-0"}`}
      >
      <div
        className={`flex shrink-0 border-b border-sidebar-border ${
          effectiveCollapsed
            ? "flex-col items-center gap-2 px-2 py-3"
            : "flex-row items-center gap-2.5 px-4 h-16"
        }`}
      >
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover text-white shrink-0">
          <Zap size={17} strokeWidth={2.25} />
        </div>
        {!effectiveCollapsed && (
          <div className="min-w-0 animate-fade-in">
            <div className="text-sm font-semibold text-white leading-tight truncate">Skills Hub</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`hidden lg:flex shrink-0 text-sidebar-muted hover:text-white hover:bg-sidebar-hover rounded-md p-1.5 transition-colors ${
            effectiveCollapsed ? "" : "ml-auto"
          }`}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden ml-auto shrink-0 text-sidebar-muted hover:text-white hover:bg-sidebar-hover rounded-md p-1.5 transition-colors"
          title="Fechar menu"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-2.5 pt-3 shrink-0">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
          title="Busca rápida"
          className={`flex items-center gap-2.5 w-full rounded-md border border-sidebar-border px-3 py-2 text-xs text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text transition-colors ${
            effectiveCollapsed ? "justify-center" : ""
          }`}
        >
          <Search size={14} />
          {!effectiveCollapsed && (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <kbd className="text-[10px] border border-sidebar-border rounded px-1 py-0.5">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto sidebar-scroll px-2.5 py-4">
        <SectionLabel collapsed={effectiveCollapsed}>Principal</SectionLabel>
        <NavLink
          href="/"
          active={pathname === "/"}
          icon={<LayoutGrid size={16} />}
          label="Skills"
          collapsed={effectiveCollapsed}
        />
        <NavLink
          href="/history"
          active={pathname === "/history"}
          icon={<History size={16} />}
          label="Histórico"
          collapsed={effectiveCollapsed}
        />
        <NavLink
          href="/schedules"
          active={pathname === "/schedules"}
          icon={<CalendarClock size={16} />}
          label="Agendamentos"
          collapsed={effectiveCollapsed}
        />
        {isAdmin && (
          <NavLink
            href="/admin/users"
            active={pathname === "/admin/users"}
            icon={<Shield size={16} />}
            label="Usuários"
            collapsed={effectiveCollapsed}
          />
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between px-1">
            <SectionLabel collapsed={effectiveCollapsed}>
              Suas skills{skills.length > 0 ? ` (${skills.length})` : ""}
            </SectionLabel>
            {!effectiveCollapsed && (
              <Link
                href="/skills/new"
                title="Nova skill"
                className="text-sidebar-muted hover:text-white transition-colors p-1 -mt-4"
              >
                <Plus size={14} />
              </Link>
            )}
          </div>

          {!effectiveCollapsed && skills.length > 3 && (
            <div className="relative mb-2 mt-1">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sidebar-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar skills..."
                className="w-full rounded-md bg-white/5 border border-sidebar-border pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-sidebar-muted focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60"
              />
            </div>
          )}

          {groups.length === 0 && !effectiveCollapsed && (
            <p className="px-3 py-2 text-xs text-sidebar-muted">
              {archivedCount > 0
                ? `Todas as suas skills estão arquivadas (${archivedCount}).`
                : "Nenhuma skill ainda."}
            </p>
          )}

          {groups.map(([groupName, groupSkills]) => (
            <div key={groupName} className="mb-3 last:mb-0">
              {!effectiveCollapsed && groups.length > 1 && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted/70">
                  {groupName}
                </div>
              )}
              <div className="space-y-0.5">
                {groupSkills.map((skill) => (
                  <SkillNavLink
                    key={skill.id}
                    skill={skill}
                    active={pathname === `/skills/${skill.id}`}
                    collapsed={effectiveCollapsed}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-2.5 shrink-0 space-y-1">
        {effectiveCollapsed ? (
          <Link
            href="/skills/new"
            title="Nova skill"
            className="flex items-center justify-center h-9 w-full rounded-md bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
          </Link>
        ) : (
          userDisplayName && (
            <button
              type="button"
              onClick={() => setEditingNickname(true)}
              title="Editar apelido"
              className="group flex items-center gap-2.5 px-2 py-1.5 mb-1 w-full rounded-md hover:bg-sidebar-hover transition-colors"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sidebar-text">
                <User size={13} />
              </span>
              <span className="text-xs text-sidebar-text truncate flex-1 text-left">{userDisplayName}</span>
              <Pencil size={11} className="shrink-0 text-sidebar-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )
        )}
        <ThemeToggle collapsed={effectiveCollapsed} />
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          title={effectiveCollapsed ? "Sair da conta" : undefined}
          className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors w-full disabled:opacity-50 ${
            effectiveCollapsed ? "justify-center" : ""
          }`}
        >
          <LogOut size={15} />
          {!effectiveCollapsed && <span>Sair da conta</span>}
        </button>
      </div>
      </aside>

      {editingNickname && (
        <NicknameModal
          currentNickname={userNickname}
          onClose={() => setEditingNickname(false)}
          onSaved={() => {
            setEditingNickname(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function NicknameModal({
  currentNickname,
  onClose,
  onSaved,
}: {
  currentNickname: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(currentNickname ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: value.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao salvar (HTTP ${res.status})`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o apelido");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-backdrop-in"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-line max-w-sm w-full shadow-2xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-primary to-primary-hover px-5 pt-5 pb-6 text-white overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
            className="absolute right-3 top-3 text-white/70 hover:text-white rounded-md p-1 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <User size={19} />
            </span>
            <h3 className="font-semibold">Como quer ser chamado?</h3>
          </div>
        </div>
        <div className="p-5">
          <label className="block text-sm font-medium text-ink mb-1">Apelido</label>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Como aparece pra você no painel e no histórico"
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
          <p className="text-xs text-muted mt-1.5">
            Deixa em branco pra voltar a mostrar o email.
          </p>
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
              {error}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md px-3.5 py-2 text-sm border border-line hover:bg-canvas transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-muted">
      {children}
    </div>
  );
}

function NavLink({
  href,
  active,
  icon,
  label,
  collapsed,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-active text-white"
          : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {active && !collapsed && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
      )}
      <span className={active ? "text-primary" : "text-sidebar-muted group-hover:text-white transition-colors"}>
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function SkillNavLink({
  skill,
  active,
  collapsed,
}: {
  skill: SidebarSkill;
  active: boolean;
  collapsed: boolean;
}) {
  const dotClass = skill.status === "active" ? "bg-emerald-400" : "bg-sidebar-muted";

  return (
    <Link
      href={`/skills/${skill.id}`}
      title={collapsed ? skill.name : undefined}
      className={`group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-sidebar-active text-white"
          : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {active && !collapsed && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />
      )}
      <span className="shrink-0 text-sidebar-muted group-hover:text-white transition-colors">
        {skill.usesCowork ? <Bot size={14} /> : <Sparkles size={14} />}
      </span>
      {!collapsed && (
        <>
          <span className="truncate flex-1">{skill.name}</span>
          <span
            className={`shrink-0 h-1.5 w-1.5 rounded-full ${dotClass} ${
              skill.status === "active" ? "animate-pulse" : ""
            }`}
            title={skill.status === "active" ? "Ativa" : "Rascunho"}
          />
        </>
      )}
    </Link>
  );
}
