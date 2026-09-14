import Link from "next/link";
import { Bot, History, PenLine, Sparkles } from "lucide-react";
import StatusBadge from "./StatusBadge";

interface SkillCardProps {
  id: string;
  name: string;
  description: string;
  status: string;
  needsInput: boolean;
  usesCowork: boolean;
  executionCount: number;
}

export default function SkillCard({
  id,
  name,
  description,
  status,
  needsInput,
  usesCowork,
  executionCount,
}: SkillCardProps) {
  return (
    <Link
      href={`/skills/${id}`}
      className="group block rounded-xl border border-line bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              usesCowork ? "bg-cowork-soft text-cowork" : "bg-primary-soft text-primary"
            }`}
          >
            {usesCowork ? <Bot size={16} /> : <Sparkles size={16} />}
          </span>
          <h3 className="font-medium text-ink truncate group-hover:text-primary transition-colors">
            {name}
          </h3>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-2.5 text-sm text-ink/60 line-clamp-2 min-h-[2.5rem]">
        {description || "Sem descrição ainda."}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
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
        <span className="ml-auto inline-flex items-center gap-1">
          <History size={11} />
          {executionCount}
        </span>
      </div>
    </Link>
  );
}
