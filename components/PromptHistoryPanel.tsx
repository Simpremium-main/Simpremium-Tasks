"use client";

import { useState } from "react";
import { History, Loader2, RotateCcw, User } from "lucide-react";

interface PromptVersionItem {
  id: string;
  promptTemplate: string;
  changedBy: string | null;
  createdAt: string;
}

/**
 * Lets someone editing a skill see past prompt versions and pull one back
 * into the form — never saves on its own, "Usar essa versão" just fills the
 * textarea so the normal "Salvar alterações" flow still applies. Collapsed
 * and unloaded by default: most edits never need this, so there's no point
 * querying skill_prompt_versions on every visit to the edit page.
 */
export default function PromptHistoryPanel({
  skillId,
  onRestore,
}: {
  skillId: string;
  onRestore: (promptTemplate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [versions, setVersions] = useState<PromptVersionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/skills/${skillId}/prompt-history`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PromptVersionItem[] = await res.json();
        setVersions(data);
        setLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar o histórico");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
      >
        <History size={12} />
        {open ? "Ocultar histórico do prompt" : "Ver histórico do prompt"}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-line bg-canvas/40 p-2.5 space-y-2">
          {loading && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" />
              Carregando…
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {loaded && versions.length === 0 && (
            <p className="text-xs text-muted">Nenhuma edição anterior registrada ainda.</p>
          )}
          {versions.map((v) => (
            <div key={v.id} className="rounded border border-line bg-white p-2 text-xs">
              <div className="flex items-center gap-2 text-muted mb-1">
                <span>{new Date(v.createdAt).toLocaleString("pt-BR")}</span>
                {v.changedBy && (
                  <span className="inline-flex items-center gap-1">
                    <User size={10} />
                    {v.changedBy}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRestore(v.promptTemplate)}
                  className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary-hover font-medium transition-colors"
                >
                  <RotateCcw size={11} />
                  Usar essa versão
                </button>
              </div>
              <p className="line-clamp-2 text-ink/70 font-mono">{v.promptTemplate}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
