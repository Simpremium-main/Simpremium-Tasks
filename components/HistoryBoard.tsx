"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckSquare, Download, Loader2, RotateCcw, Search } from "lucide-react";
import ExecutionList, { type ExecutionItem } from "./ExecutionList";

type Filter = "all" | "success" | "error" | "needs_setup" | "files" | "favorites";

// A stored input value only ever looks like this when it was masked before
// being written to execution history (lib/mask.ts's maskValue — a run of
// "•" characters). Retrying with a masked value would silently resubmit
// garbage instead of the real secret, so bulk retry skips any execution
// whose inputValues contain one rather than attempting it.
function hasMaskedSecret(inputValues: Record<string, string> | null): boolean {
  if (!inputValues) return false;
  return Object.values(inputValues).some((v) => typeof v === "string" && v.includes("•"));
}

export default function HistoryBoard({ executions: initialExecutions }: { executions: ExecutionItem[] }) {
  const router = useRouter();
  const [executions, setExecutions] = useState(initialExecutions);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkInfo, setBulkInfo] = useState<string | null>(null);

  // Same staleness fix as RunSkillPanel: this page has no per-row way to
  // learn a Cowork job finished (it's reported minutes later, out of band,
  // by the Mac mini agent), so without re-syncing to the server-rendered
  // prop a "running" row here would sit stale until a full page reload.
  useEffect(() => {
    setExecutions(initialExecutions);
  }, [initialExecutions]);

  useEffect(() => {
    const hasPendingCowork = executions.some((e) => e.source === "cowork" && e.status === "running");
    if (!hasPendingCowork) return;
    const interval = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(interval);
  }, [executions, router]);

  const hasFiles = useMemo(() => executions.some((e) => e.files && e.files.length > 0), [executions]);
  const hasFavorites = useMemo(() => executions.some((e) => e.favorite), [executions]);

  function handleFavoriteChange(id: string, favorite: boolean) {
    setExecutions((prev) => prev.map((e) => (e.id === id ? { ...e, favorite } : e)));
  }

  function handleCancel(cancelled: ExecutionItem) {
    setExecutions((prev) => prev.map((e) => (e.id === cancelled.id ? cancelled : e)));
  }

  function toggleSelectMode() {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
    setBulkError(null);
    setBulkInfo(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkExportCsv() {
    const ids = Array.from(selectedIds).join(",");
    window.location.href = `/api/executions/export?ids=${encodeURIComponent(ids)}`;
  }

  async function bulkRetry() {
    setBulkWorking(true);
    setBulkError(null);
    setBulkInfo(null);
    const selected = executions.filter((e) => selectedIds.has(e.id));
    const retryable = selected.filter((e) => e.skill && !hasMaskedSecret(e.inputValues));
    const skipped = selected.length - retryable.length;
    try {
      const results = await Promise.all(
        retryable.map((e) =>
          fetch(`/api/skills/${e.skill!.id}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inputValues: e.inputValues ?? {} }),
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      const succeeded = results.length - failed;
      const parts = [`${succeeded} de ${retryable.length} reexecutada${retryable.length === 1 ? "" : "s"}`];
      if (skipped > 0) {
        parts.push(
          `${skipped} pulada${skipped === 1 ? "" : "s"} (tem campo de senha/token — precisa rodar manualmente)`
        );
      }
      if (failed > 0) parts.push(`${failed} falhou${failed === 1 ? "" : "aram"} ao disparar`);
      setBulkInfo(parts.join(" · "));
      router.refresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Falha ao reexecutar em lote");
    } finally {
      setBulkWorking(false);
    }
  }

  const filtered = useMemo(() => {
    let list = executions;
    if (filter === "files") list = list.filter((e) => e.files && e.files.length > 0);
    else if (filter === "favorites") list = list.filter((e) => e.favorite);
    else if (filter !== "all") list = list.filter((e) => e.status === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.skill?.name.toLowerCase().includes(q) ||
          e.result?.toLowerCase().includes(q) ||
          e.error?.toLowerCase().includes(q) ||
          e.promptSnapshot.toLowerCase().includes(q)
      );
    }
    return list;
  }, [executions, filter, query]);

  if (executions.length === 0) {
    return (
      <p className="text-sm text-muted border border-dashed border-line rounded-xl p-10 text-center">
        Nenhuma execução ainda.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por skill ou conteúdo do resultado..."
            className="w-full rounded-md border border-line bg-surface pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-1">
          {(
            [
              ["all", "Todas"],
              ["success", "Sucesso"],
              ["error", "Erro"],
              ["needs_setup", "Setup"],
              ...(hasFiles ? [["files", "Arquivos"] as [Filter, string]] : []),
              ...(hasFavorites ? [["favorites", "Favoritas"] as [Filter, string]] : []),
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === value ? "bg-primary text-white" : "text-muted hover:bg-canvas"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectMode}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
              selectMode
                ? "border-primary/30 bg-primary-soft text-primary"
                : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            <CheckSquare size={13} />
            {selectMode ? "Cancelar seleção" : "Selecionar"}
          </button>
        )}
      </div>

      {selectMode && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary-soft/50 px-3.5 py-2.5">
          <span className="text-sm font-medium text-ink">
            {selectedIds.size} selecionada{selectedIds.size === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={bulkRetry}
              disabled={selectedIds.size === 0 || bulkWorking}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink/80 hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkWorking ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Reexecutar
            </button>
            <button
              type="button"
              onClick={bulkExportCsv}
              disabled={selectedIds.size === 0 || bulkWorking}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink/80 hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={13} />
              Exportar CSV
            </button>
          </div>
          {bulkError && (
            <span className="w-full inline-flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle size={12} />
              {bulkError}
            </span>
          )}
          {bulkInfo && <span className="w-full text-xs text-ink/70">{bulkInfo}</span>}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted border border-dashed border-line rounded-xl p-10 text-center">
          Nenhuma execução encontrada com esse filtro.
        </p>
      ) : (
        <ExecutionList
          executions={filtered}
          showSkillName
          onFavoriteChange={handleFavoriteChange}
          onCancel={handleCancel}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
        />
      )}
    </div>
  );
}
