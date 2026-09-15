"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import SkillCard from "./SkillCard";

export interface BoardSkill {
  id: string;
  name: string;
  description: string;
  status: string;
  needsInput: boolean;
  usesCowork: boolean;
  executionCount: number;
  needsSetup: boolean;
  group: string | null;
  tags: string[];
}

type Filter = "all" | "active" | "draft" | "needs_setup" | "archived";
const ALL_GROUPS = "__all__";

export default function SkillsBoard({ skills }: { skills: BoardSkill[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState(ALL_GROUPS);

  const groups = useMemo(() => {
    const set = new Set(skills.map((s) => s.group).filter((g): g is string => Boolean(g)));
    return Array.from(set).sort();
  }, [skills]);

  const hasArchived = useMemo(() => skills.some((s) => s.status === "archived"), [skills]);

  const filtered = useMemo(() => {
    let list = skills;
    // "Todas" means "everything still in active use" — archived skills are
    // meant to be out of the way by default, only surfaced through their
    // own tab, same reasoning as an inbox hiding archived mail.
    if (filter === "all") list = list.filter((s) => s.status !== "archived");
    else if (filter === "active") list = list.filter((s) => s.status === "active");
    else if (filter === "draft") list = list.filter((s) => s.status === "draft");
    else if (filter === "needs_setup") list = list.filter((s) => s.needsSetup);
    else if (filter === "archived") list = list.filter((s) => s.status === "archived");

    if (group !== ALL_GROUPS) list = list.filter((s) => s.group === group);

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.includes(q))
      );
    }
    return list;
  }, [skills, filter, group, query]);

  return (
    <div>
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
        {groups.length > 0 && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="rounded-md border border-line bg-white px-2.5 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value={ALL_GROUPS}>Todos os grupos</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1 rounded-md border border-line bg-white p-1">
          {(
            [
              ["all", "Todas"],
              ["active", "Ativas"],
              ["draft", "Rascunho"],
              ["needs_setup", "Setup"],
              ...(hasArchived ? [["archived", "Arquivadas"] as [Filter, string]] : []),
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
              group={skill.group}
              tags={skill.tags}
            />
          ))}
        </div>
      )}
    </div>
  );
}
