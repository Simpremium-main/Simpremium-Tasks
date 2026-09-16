import Link from "next/link";
import { AlertTriangle, Bot, CheckSquare, Folder, History, PenLine, Square, Sparkles } from "lucide-react";
import StatusBadge from "./StatusBadge";

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
  selectable = false,
  selected = false,
  onToggleSelect,
}: SkillCardProps) {
  return (
    <Link
      href={`/skills/${id}`}
      onClick={(e) => {
        if (!selectable) return;
        e.preventDefault();
        onToggleSelect?.();
      }}
      className={`group block rounded-xl border bg-white p-4 transition-all duration-200 ${
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
        {tags.slice(0, 3).map((tag) => (
          <span key={tag} className="inline-flex items-center rounded-full bg-primary-soft text-primary px-2 py-0.5">
            {tag}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 shrink-0">
          <History size={11} />
          {executionCount}
        </span>
      </div>
    </Link>
  );
}
