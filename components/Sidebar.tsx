"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Bot,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  User,
  X,
  Zap,
} from "lucide-react";

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
  userName,
}: {
  skills: SidebarSkill[];
  userName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-sidebar-border">
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
          className="hidden lg:flex ml-auto shrink-0 text-sidebar-muted hover:text-white hover:bg-sidebar-hover rounded-md p-1.5 transition-colors"
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
            <p className="px-3 py-2 text-xs text-sidebar-muted">Nenhuma skill ainda.</p>
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
          userName && (
            <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sidebar-text">
                <User size={13} />
              </span>
              <span className="text-xs text-sidebar-text truncate flex-1">{userName}</span>
            </div>
          )
        )}
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
    </>
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
