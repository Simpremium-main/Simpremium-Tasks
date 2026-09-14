"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, History, LayoutGrid, Search } from "lucide-react";
import SkillCard from "./SkillCard";
import StatTile from "./StatTile";

export interface BoardSkill {
  id: string;
  name: string;
  description: string;
  status: string;
  needsInput: boolean;
  usesCowork: boolean;
  executionCount: number;
  needsSetup: boolean;
}

type Filter = "all" | "active" | "draft" | "needs_setup";

export default function SkillsBoard({ skills }: { skills: BoardSkill[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const stats = useMemo(
    () => ({
      total: skills.length,
      active: skills.filter((s) => s.status === "active").length,
      draft: skills.filter((s) => s.status === "draft").length,
      needsSetup: skills.filter((s) => s.needsSetup).length,
      totalRuns: skills.reduce((sum, s) => sum + s.executionCount, 0),
    }),
    [skills]
  );

  const filtered = useMemo(() => {
    let list = skills;
    if (filter === "active") list = list.filter((s) => s.status === "active");
    else if (filter === "draft") list = list.filter((s) => s.status === "draft");
    else if (filter === "needs_setup") list = list.filter((s) => s.needsSetup);

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [skills, filter, query]);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-stagger">
        <StatTile icon={<LayoutGrid size={16} />} label="Total de skills" value={stats.total} tone="primary" />
        <StatTile icon={<CheckCircle2 size={16} />} label="Ativas" value={stats.active} tone="emerald" />
        <StatTile
          icon={<AlertTriangle size={16} />}
          label="Precisam de setup"
          value={stats.needsSetup}
          tone={stats.needsSetup > 0 ? "amber" : "slate"}
        />
        <StatTile icon={<History size={16} />} label="Execuções totais" value={stats.totalRuns} tone="slate" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar skills..."
            className="w-full rounded-md border border-line bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-line bg-white p-1">
          {(
            [
              ["all", "Todas"],
              ["active", "Ativas"],
              ["draft", "Rascunho"],
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
          Nenhuma skill encontrada com esse filtro.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
          {filtered.map((skill) => (
            <SkillCard
              key={skill.id}
              id={skill.id}
              name={skill.name}
              description={skill.description}
              status={skill.status}
              needsInput={skill.needsInput}
              usesCowork={skill.usesCowork}
              executionCount={skill.executionCount}
              needsSetup={skill.needsSetup}
            />
          ))}
        </div>
      )}
    </div>
  );
}
