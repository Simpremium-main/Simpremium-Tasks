"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  Bot,
  CalendarClock,
  CheckSquare,
  Folder,
  History,
  Loader2,
  PenLine,
  Pin,
  Send,
  Square,
  Sparkles,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import ScheduleModal from "./ScheduleModal";
import type { ApiFieldSource, InputField, SkillSchedule } from "@/lib/types";

interface SkillCardProps {
  id: string;
  name: string;
  description: string;
  status: string;
  needsInput: boolean;
  usesCowork: boolean;
  executionCount: number;
  needsSetup?: boolean;
  group?: string | null;
  tags?: string[];
  inputSchema: InputField[];
  schedule: SkillSchedule | null;
  scheduleInputValues: Record<string, string> | null;
  scheduleApiSources: Record<string, ApiFieldSource[]> | null;
  scheduleLastRunAt: string | null;
  /** Whether this skill has an outputCallback configured (lib/types.ts) —
   *  only used to show the small "retorno API" badge below, doesn't need
   *  the full config here. */
  hasOutputCallback: boolean;
  hasUnschedulableSecret: boolean;
  pinned: boolean;
  /** Bulk-select mode (SkillsBoard) — when set, the card toggles selection
   *  on click instead of navigating. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export default function SkillCard({
  id,
  name,
  description,
  status,
  needsInput,
  usesCowork,
  executionCount,
  needsSetup,
  group,
  tags = [],
  inputSchema,
  schedule,
  scheduleInputValues,
  scheduleApiSources,
  scheduleLastRunAt,
  hasOutputCallback,
  hasUnschedulableSecret,
  pinned,
  selectable = false,
  selected = false,
  onToggleSelect,
}: SkillCardProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pinWorking, setPinWorking] = useState(false);
  // Values/API sources can be configured (for the manual "Buscar dados da
  // API" button on RunSkillPanel) without an active recurring schedule.
  const hasConfiguredScheduleValues =
    Boolean(scheduleInputValues && Object.keys(scheduleInputValues).length) ||
    Boolean(scheduleApiSources && Object.keys(scheduleApiSources).length);

  async function togglePin(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPinWorking(true);
    try {
      const res = await fetch(`/api/skills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned }),
      });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      setPinWorking(false);
    }
  }

  return (
    <>
      <Link
        href={`/skills/${id}`}
        onClick={(e) => {
          if (!selectable) return;
          e.preventDefault();
          onToggleSelect?.();
        }}
        className={`group block rounded-xl border bg-surface p-4 transition-all duration-200 ${
          selectable
            ? selected
              ? "border-primary/50 ring-1 ring-primary/30"
              : "border-line hover:border-primary/30"
            : "border-line hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectable ? (
              <span className={`shrink-0 ${selected ? "text-primary" : "text-muted"}`}>
                {selected ? <CheckSquare size={18} /> : <Square size={18} />}
              </span>
            ) : (
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  usesCowork ? "bg-cowork-soft text-cowork" : "bg-primary-soft text-primary"
                }`}
              >
                {usesCowork ? <Bot size={16} /> : <Sparkles size={16} />}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="font-medium text-ink truncate group-hover:text-primary transition-colors">
                {name}
              </h3>
              {group && (
                <span className="flex items-center gap-1 text-[11px] text-muted truncate">
                  <Folder size={10} />
                  {group}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {needsSetup && (
              <span title="Precisa de configuração manual" className="text-amber-500">
                <AlertTriangle size={14} />
              </span>
            )}
            <StatusBadge status={status} />
            {!selectable && (
              <button
                type="button"
                onClick={togglePin}
                disabled={pinWorking}
                title={pinned ? "Desafixar" : "Fixar no topo"}
                className={`rounded-md p-0.5 transition-colors disabled:opacity-60 ${
                  pinned ? "text-primary" : "text-muted/40 hover:text-primary"
                }`}
              >
                {pinWorking ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Pin size={14} className={pinned ? "fill-current" : ""} />
                )}
              </button>
            )}
          </div>
        </div>
        <p className="mt-2.5 text-sm text-ink/60 line-clamp-2 min-h-[2.5rem]">
          {description || "Sem descrição ainda."}
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted flex-wrap">
          {needsInput && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5" title="Precisa de input para rodar">
              <PenLine size={11} />
              input
            </span>
          )}
          {usesCowork && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-cowork-soft text-cowork px-2 py-0.5"
              title="Roda via Claude Cowork"
            >
              <Bot size={11} />
              Cowork
            </span>
          )}
          {scheduleApiSources && Object.keys(scheduleApiSources).length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5"
              title="Algum campo do agendamento busca o valor de uma API externa"
            >
              <ArrowDownToLine size={11} />
              input API
            </span>
          )}
          {hasOutputCallback && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5"
              title="Envia o resultado pra outra API quando termina com sucesso"
            >
              <Send size={11} />
              retorno API
            </span>
          )}
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="inline-flex items-center rounded-full bg-primary-soft text-primary px-2 py-0.5">
              {tag}
            </span>
          ))}
          {!selectable && !hasUnschedulableSecret && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setScheduleOpen(true);
              }}
              title={
                schedule
                  ? "Editar agendamento"
                  : hasConfiguredScheduleValues
                    ? "Valores/fontes de API configurados, sem agendamento automático ativo"
                    : "Agendar essa skill"
              }
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
                schedule || hasConfiguredScheduleValues
                  ? "bg-primary-soft text-primary"
                  : "bg-slate-100 text-muted hover:text-primary hover:bg-primary-soft"
              }`}
            >
              <CalendarClock size={11} />
              {schedule ? "Agendada" : hasConfiguredScheduleValues ? "Configurada" : "Agendar"}
            </button>
          )}
          <span className="ml-auto inline-flex items-center gap-1 shrink-0">
            <History size={11} />
            {executionCount}
          </span>
        </div>
      </Link>
      {scheduleOpen && (
        <ScheduleModal
          skillId={id}
          skillName={name}
          inputSchema={inputSchema}
          schedule={schedule}
          scheduleInputValues={scheduleInputValues}
          scheduleApiSources={scheduleApiSources}
          scheduleLastRunAt={scheduleLastRunAt}
          hasUnschedulableSecret={hasUnschedulableSecret}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </>
  );
}
