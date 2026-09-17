"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "skillshub:theme";

/**
 * Toggles the `dark` class on <html> (tailwind.config.ts's darkMode:
 * "class") and remembers the choice — app/layout.tsx's inline script reads
 * the same key before hydration so the page never flashes the wrong theme.
 * Starts undecided (`null`) until mounted, since the real state lives on
 * `<html>` (set by that same inline script) and reading it during SSR would
 * just be guessing; a collapsed sidebar shows nothing until then rather
 * than a button that might flip a moment later.
 */
export default function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage unavailable — theme just won't persist across reloads
    }
  }

  if (isDark === null) {
    return <div className={collapsed ? "h-9 w-full" : "h-[34px] w-full"} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-text hover:bg-sidebar-hover transition-colors w-full ${
        collapsed ? "justify-center" : ""
      }`}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      {!collapsed && <span>{isDark ? "Tema claro" : "Tema escuro"}</span>}
    </button>
  );
}
