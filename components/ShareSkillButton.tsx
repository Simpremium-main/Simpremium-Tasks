"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Copy, Link2, Loader2, X } from "lucide-react";

/**
 * Toggles a public, no-login read-only view of this skill (name,
 * description, execution history — never the prompt template, never a run
 * button) at /share/[token]. Portaled to document.body: any modal rendered
 * through PageHeader's actions slot needs this (see ScheduleModal for the
 * same reasoning — PageHeader's backdrop-blur otherwise traps a
 * position: fixed modal to the wrong spot).
 */
export default function ShareSkillButton({
  skillId,
  shareToken: initialToken,
}: {
  skillId: string;
  shareToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function enable() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}/share`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao ativar (HTTP ${res.status})`);
      }
      const skill = await res.json();
      setToken(skill.shareToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ativar o compartilhamento");
    } finally {
      setWorking(false);
    }
  }

  async function disable() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}/share`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao desativar (HTTP ${res.status})`);
      }
      setToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desativar o compartilhamento");
    } finally {
      setWorking(false);
    }
  }

  const shareUrl =
    token && typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore, button just won't confirm
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={token ? "Link de visualização ativo" : "Compartilhar essa skill (link somente leitura)"}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          token
            ? "border-primary/30 bg-primary-soft text-primary"
            : "border-line text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft"
        }`}
      >
        <Link2 size={13} />
        {token ? "Compartilhado" : "Compartilhar"}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-backdrop-in"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-surface rounded-xl border border-line max-w-md w-full p-5 shadow-xl animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-ink flex items-center gap-2">
                  <Link2 size={16} className="text-primary" />
                  Link de visualização
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                  className="text-muted hover:text-ink rounded-md p-1 hover:bg-canvas transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-sm text-ink/70 mb-4">
                Gera um link somente leitura (sem login) com o nome, a descrição e o histórico de
                execuções dessa skill — sem o template do prompt e sem botão de rodar. Bom pra
                mostrar pra alguém que não tem acesso ao painel.
              </p>

              {token ? (
                <div>
                  <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-xs">
                    <span className="flex-1 truncate font-mono text-ink/70">{shareUrl}</span>
                    <button
                      type="button"
                      onClick={copy}
                      className="inline-flex items-center gap-1 text-primary hover:text-primary-hover shrink-0"
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={disable}
                    disabled={working}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-60 transition-colors"
                  >
                    {working ? <Loader2 size={13} className="animate-spin" /> : null}
                    Desativar link
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={enable}
                  disabled={working}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 transition-colors"
                >
                  {working ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  Ativar link
                </button>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
