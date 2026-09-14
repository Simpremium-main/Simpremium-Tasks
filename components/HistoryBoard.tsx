"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, History, Search, XCircle } from "lucide-react";
import ExecutionList, { type ExecutionItem } from "./ExecutionList";
import StatTile from "./StatTile";

type Filter = "all" | "success" | "error" | "needs_setup";

export default function HistoryBoard({ executions }: { executions: ExecutionItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const stats = useMemo(
    () => ({
      total: executions.length,
      success: executions.filter((e) => e.status === "success").length,
      error: executions.filter((e) => e.status === "error").length,
      needsSetup: executions.filter((e) => e.status === "needs_setup").length,
    }),
    [executions]
  );

  const filtered = useMemo(() => {
    let list = executions;
    if (filter !== "all") list = list.filter((e) => e.status === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((e) => e.skill?.name.toLowerCase().includes(q));
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-stagger">
        <StatTile icon={<History size={16} />} label="Total de execuções" value={stats.total} tone="primary" />
        <StatTile icon={<CheckCircle2 size={16} />} label="Sucesso" value={stats.success} tone="emerald" />
        <StatTile icon={<XCircle size={16} />} label="Erro" value={stats.error} tone={stats.error > 0 ? "amber" : "slate"} />
        <StatTile
          icon={<AlertTriangle size={16} />}
          label="Precisam de setup"
          value={stats.needsSetup}
          tone={stats.needsSetup > 0 ? "amber" : "slate"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por skill..."
            className="w-full rounded-md border border-line bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-line bg-white p-1">
          {(
            [
              ["all", "Todas"],
              ["success", "Sucesso"],
              ["error", "Erro"],
              ["needs_setup", "Setup"],
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
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted border border-dashed border-line rounded-xl p-10 text-center">
          Nenhuma execução encontrada com esse filtro.
        </p>
      ) : (
        <ExecutionList executions={filtered} showSkillName />
      )}
    </div>
  );
}
