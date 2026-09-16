"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckSquare, Loader2, Search, Trash2, X } from "lucide-react";
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  function toggleSelectMode() {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
    setBulkError(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkArchive() {
    setBulkWorking(true);
    setBulkError(null);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/skills/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "archived" }),
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) throw new Error(`${failed} de ${results.length} não foram arquivadas`);
      window.location.href = "/";
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Falha ao arquivar em lote");
      setBulkWorking(false);
    }
  }

  async function bulkDelete() {
    setBulkWorking(true);
    setBulkError(null);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((id) => fetch(`/api/skills/${id}`, { method: "DELETE" }))
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) throw new Error(`${failed} de ${results.length} não foram excluídas`);
      window.location.href = "/";
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Falha ao excluir em lote");
      setBulkWorking(false);
      setConfirmBulkDelete(false);
    }
  }

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
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectMode}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
              selectMode
                ? "border-primary/30 bg-primary-soft text-primary"
                : "border-line bg-white text-muted hover:text-ink"
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
              onClick={bulkArchive}
              disabled={selectedIds.size === 0 || bulkWorking}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkWorking ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
              Arquivar
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={selectedIds.size === 0 || bulkWorking}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} />
              Excluir
            </button>
          </div>
          {bulkError && (
            <span className="w-full inline-flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle size={12} />
              {bulkError}
            </span>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-sm text-muted border border-dashed border-line rounded-xl p-10 text-center">
          {filter === "all" && hasArchived ? (
            <>
              <p>Todas as suas skills estão arquivadas.</p>
              <button
                type="button"
                onClick={() => setFilter("archived")}
                className="mt-2 text-primary hover:underline font-medium"
              >
                Ver arquivadas
              </button>
            </>
          ) : (
            <p>Nenhuma skill encontrada com esse filtro.</p>
          )}
        </div>
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
              selectable={selectMode}
              selected={selectedIds.has(skill.id)}
              onToggleSelect={() => toggleSelected(skill.id)}
            />
          ))}
        </div>
      )}

      {confirmBulkDelete && (
        <div
          className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-backdrop-in"
          onClick={() => !bulkWorking && setConfirmBulkDelete(false)}
        >
          <div
            className="bg-white rounded-2xl border border-line max-w-md w-full shadow-2xl animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-br from-red-500 to-red-600 px-5 pt-5 pb-6 text-white overflow-hidden">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkWorking}
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
                  <p className="text-xs font-medium text-white/70 uppercase tracking-wide">Excluir em lote</p>
                  <h3 className="font-semibold truncate">
                    {selectedIds.size} skill{selectedIds.size === 1 ? "" : "s"}
                  </h3>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted">
                Isso apaga {selectedIds.size === 1 ? "essa skill" : "essas skills"} e todo o
                histórico de execuções delas. Não dá pra desfazer.
              </p>
              {bulkError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-semibold">Não excluiu.</strong> {bulkError}
                  </span>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  disabled={bulkWorking}
                  className="rounded-md px-3.5 py-2 text-sm border border-line hover:bg-canvas transition-colors disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={bulkDelete}
                  disabled={bulkWorking}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-sm shadow-red-600/30 hover:bg-red-700 hover:shadow-md hover:shadow-red-600/30 disabled:opacity-60 disabled:shadow-none transition-all"
                >
                  {bulkWorking ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {bulkWorking ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
