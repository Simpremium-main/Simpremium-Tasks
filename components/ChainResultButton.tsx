"use client";

import { useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";

interface SkillOption {
  id: string;
  name: string;
  needsInput: boolean;
  status: string;
}

// The key RunSkillPanel checks on mount to prefill from — sessionStorage
// (not a query param) so the result text never has to round-trip through a
// URL, and it's gone the moment it's consumed or the tab closes.
export const CHAIN_INPUT_STORAGE_KEY = "skillshub:chain-input";

/**
 * A deliberately small, low-prominence way to hand one execution's result
 * to another skill as its input, without copy-pasting by hand — not a real
 * pipeline/workflow builder, just "open that skill with this text already
 * filled in." Lazy-loads the skill list only when opened.
 */
export default function ChainResultButton({ resultText }: { resultText: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && skills.length === 0) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/skills");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SkillOption[] = await res.json();
        const usable = data.filter((s) => s.needsInput && s.status !== "archived");
        setSkills(usable);
        if (usable.length > 0) setSelectedId(usable[0].id);
      } catch {
        setError("Falha ao carregar a lista de skills.");
      } finally {
        setLoading(false);
      }
    }
  }

  function go() {
    if (!selectedId) return;
    try {
      sessionStorage.setItem(CHAIN_INPUT_STORAGE_KEY, resultText);
    } catch {
      // sessionStorage unavailable (private mode, etc.) — nothing to chain
      // into, just navigate without a prefill instead of failing the click.
    }
    window.location.href = `/skills/${selectedId}`;
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={handleToggle}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
        title="Usar esse resultado como input de outra skill"
      >
        <ArrowRightLeft size={13} />
        Encadear em outra skill
      </button>

      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-canvas/40 p-2">
          {loading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" />
              Carregando skills…
            </span>
          ) : error ? (
            <span className="text-xs text-red-600">{error}</span>
          ) : skills.length === 0 ? (
            <span className="text-xs text-muted">Nenhuma skill com input pra encadear.</span>
          ) : (
            <>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-md border border-line bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={go}
                className="rounded-md bg-primary text-white px-3 py-1.5 text-xs font-medium hover:bg-primary-hover transition-colors"
              >
                Ir
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
