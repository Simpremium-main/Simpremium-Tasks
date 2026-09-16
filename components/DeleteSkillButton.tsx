"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

export default function DeleteSkillButton({ skillId, skillName }: { skillId: string; skillName: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao excluir (HTTP ${res.status})`);
      }
      // A hard navigation, not router.push()+router.refresh(): the sidebar
      // lives in the persistent (app) layout, which the App Router does NOT
      // automatically re-fetch on a client-side route change to a page that
      // shares it — and calling refresh() right after push() in the same
      // tick races Next's navigation scheduling, so it can miss the new
      // route entirely. That's what left the sidebar showing a just-deleted
      // skill even though the delete itself succeeded. A full navigation
      // always re-fetches everything, layout included — worth the
      // reload flash for an action this infrequent.
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir a skill");
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        title="Excluir skill"
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={13} />
        Excluir
      </button>

      {showConfirm &&
        createPortal(
          <div
            className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-backdrop-in"
            onClick={() => !deleting && setShowConfirm(false)}
          >
            <div
              className="bg-white rounded-2xl border border-line max-w-md w-full shadow-2xl animate-scale-in overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative bg-gradient-to-br from-red-500 to-red-600 px-5 pt-5 pb-6 text-white overflow-hidden">
                <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={deleting}
                  aria-label="Fechar"
                  className="absolute right-3 top-3 text-white/70 hover:text-white rounded-md p-1 hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  <X size={16} />
                </button>
                <div className="relative flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                    <AlertTriangle size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/70 uppercase tracking-wide">Excluir skill</p>
                    <h3 className="font-semibold truncate">{skillName}</h3>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <p className="text-sm text-muted">
                  Isso apaga a skill e todo o histórico de execuções dela. Não dá pra desfazer.
                </p>
                {error && (
                  <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold">Não excluiu.</strong> {error}
                    </span>
                  </div>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    disabled={deleting}
                    className="rounded-md px-3.5 py-2 text-sm border border-line hover:bg-canvas transition-colors disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-sm shadow-red-600/30 hover:bg-red-700 hover:shadow-md hover:shadow-red-600/30 disabled:opacity-60 disabled:shadow-none transition-all"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {deleting ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
