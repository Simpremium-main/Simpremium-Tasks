"use client";

import { useState } from "react";
import { Check, Loader2, RefreshCcw } from "lucide-react";

/**
 * Admin-only trigger for POST /api/admin/purge-cache — the in-app way to do
 * what Vercel Dashboard → Settings → Data Cache → "Purge Everything" does,
 * for whoever would rather not go find that button. See that route's own
 * comment for what it actually invalidates and why.
 */
export default function PurgeCacheButton() {
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function purge() {
    setWorking(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/admin/purge-cache", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao limpar o cache (HTTP ${res.status})`);
      }
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar o cache");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Cache do CDN</div>
          <p className="text-xs text-muted mt-0.5 max-w-md">
            Limpa o cache de dados de todas as páginas de uma vez — útil se o dashboard estiver
            mostrando informação desatualizada até você recarregar mais de uma vez.
          </p>
        </div>
        <button
          type="button"
          onClick={purge}
          disabled={working}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-60 shrink-0"
        >
          {working ? (
            <Loader2 size={14} className="animate-spin" />
          ) : done ? (
            <Check size={14} className="text-emerald-600" />
          ) : (
            <RefreshCcw size={14} />
          )}
          {done ? "Limpo" : "Limpar cache"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
