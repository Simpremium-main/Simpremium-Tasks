"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ExecutionList, { type ExecutionItem } from "./ExecutionList";

type Filter = "all" | "success" | "error" | "needs_setup" | "files";

export default function HistoryBoard({ executions }: { executions: ExecutionItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const hasFiles = useMemo(() => executions.some((e) => e.files && e.files.length > 0), [executions]);

  const filtered = useMemo(() => {
    let list = executions;
    if (filter === "files") list = list.filter((e) => e.files && e.files.length > 0);
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
