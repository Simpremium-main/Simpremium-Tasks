"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Bot, CalendarClock, History, LayoutGrid, Plus, Search, Sparkles } from "lucide-react";

interface PaletteSkill {
  id: string;
  name: string;
  group: string | null;
  usesCowork: boolean;
}

interface PaletteItem {
  key: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ReactNode;
}

export const OPEN_EVENT = "skillshub:open-command-palette";

/**
 * A global ⌘K/Ctrl+K "go to" palette — not a full-text search across
 * executions (the history page's own search already covers that), just a
 * fast way to jump to a skill or a main page without clicking through the
 * sidebar. Mounted once in (app)/layout.tsx, fed the same skill list the
 * sidebar already has (no extra fetch).
 */
export default function CommandPalette({ skills }: { skills: PaletteSkill[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const staticDestinations: PaletteItem[] = useMemo(
    () => [
      { key: "dashboard", label: "Skills", href: "/", icon: <LayoutGrid size={15} /> },
      { key: "history", label: "Histórico", href: "/history", icon: <History size={15} /> },
      { key: "schedules", label: "Agendamentos", href: "/schedules", icon: <CalendarClock size={15} /> },
      { key: "new-skill", label: "Nova skill", href: "/skills/new", icon: <Plus size={15} /> },
    ],
    []
  );

  const skillItems: PaletteItem[] = useMemo(
    () =>
      skills.map((s) => ({
        key: `skill-${s.id}`,
        label: s.name,
        sublabel: s.group ?? undefined,
        href: `/skills/${s.id}`,
        icon: s.usesCowork ? <Bot size={15} className="text-cowork" /> : <Sparkles size={15} className="text-primary" />,
      })),
    [skills]
  );

  const allItems = useMemo(() => [...staticDestinations, ...skillItems], [staticDestinations, skillItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.sublabel?.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    // Sidebar's own "Buscar" button can't reach this component's state
    // directly (it's mounted one level up, in the server-rendered layout),
    // so it opens the palette by dispatching this instead of prop-drilling
    // an open/setOpen pair across that boundary.
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Wait a frame so the portal has actually mounted the input before
      // trying to focus it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function go(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) go(item);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-start justify-center pt-[15vh] p-4 z-50 animate-backdrop-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-surface rounded-xl border border-line max-w-lg w-full shadow-2xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
          <Search size={15} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Ir para uma skill ou página..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <kbd className="hidden sm:inline text-[10px] text-muted border border-line rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">Nada encontrado.</p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.key}
                type="button"
                onClick={() => go(item)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${
                  i === activeIndex ? "bg-primary-soft text-primary" : "text-ink"
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.sublabel && <span className="text-xs text-muted shrink-0">{item.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
