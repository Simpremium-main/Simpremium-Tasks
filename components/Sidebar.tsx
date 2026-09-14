"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  History,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

export interface SidebarSkill {
  id: string;
  name: string;
  status: string;
  needsInput: boolean;
  usesCowork: boolean;
}

const STORAGE_KEY = "skills-hub:sidebar-collapsed";

export default function Sidebar({ skills }: { skills: SidebarSkill[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

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

  const filteredSkills = useMemo(() => {
    if (!query.trim()) return skills;
    const q = query.trim().toLowerCase();
    return skills.filter((s) => s.name.toLowerCase().includes(q));
  }, [skills, query]);

  return (
    <aside
      className={`shrink-0 h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-300 ease-out ${
        collapsed ? "w-[72px]" : "w-[264px]"
      } ${mounted ? "" : "duration-0"}`}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-sidebar-border">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover text-white shrink-0">
          <Zap size={17} strokeWidth={2.25} />
        </div>
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            <div className="text-sm font-semibold text-white leading-tight truncate">Skills Hub</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-muted truncate">
              skills do boss
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ml-auto shrink-0 text-sidebar-muted hover:text-white hover:bg-sidebar-hover rounded-md p-1.5 transition-colors"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto sidebar-scroll px-2.5 py-4">
        <SectionLabel collapsed={collapsed}>Principal</SectionLabel>
        <NavLink
          href="/"
          active={pathname === "/"}
          icon={<LayoutGrid size={16} />}
          label="Skills"
          collapsed={collapsed}
        />
        <NavLink
          href="/history"
          active={pathname === "/history"}
          icon={<History size={16} />}
          label="Histórico"
          collapsed={collapsed}
        />

        <div className="mt-6">
          <div className="flex items-center justify-between px-1">
            <SectionLabel collapsed={collapsed}>
              Suas skills{skills.length > 0 ? ` (${skills.length})` : ""}
            </SectionLabel>
            {!collapsed && (
              <Link
                href="/skills/new"
                title="Nova skill"
                className="text-sidebar-muted hover:text-white transition-colors p-1 -mt-4"
              >
                <Plus size={14} />
              </Link>
            )}
          </div>

          {!collapsed && skills.length > 3 && (
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

          <div className="space-y-0.5">
            {filteredSkills.length === 0 && !collapsed && (
              <p className="px-3 py-2 text-xs text-sidebar-muted">Nenhuma skill ainda.</p>
            )}
            {filteredSkills.map((skill) => (
              <SkillNavLink
                key={skill.id}
                skill={skill}
                active={pathname === `/skills/${skill.id}`}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>
      </nav>

      {collapsed && (
        <div className="p-2.5 border-t border-sidebar-border">
          <Link
            href="/skills/new"
            title="Nova skill"
            className="flex items-center justify-center h-9 w-full rounded-md bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
          </Link>
        </div>
      )}
    </aside>
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
