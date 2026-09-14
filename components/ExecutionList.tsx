"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, Hand, Sparkles } from "lucide-react";
import StatusBadge from "./StatusBadge";

export interface ExecutionItem {
  id: string;
  status: string;
  source: string;
  inputValues: Record<string, string> | null;
  promptSnapshot: string;
  result: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  skill?: { id: string; name: string };
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  cowork: <Bot size={13} />,
  claude: <Sparkles size={13} />,
  manual: <Hand size={13} />,
};

const SOURCE_LABELS: Record<string, string> = {
  cowork: "Cowork",
  claude: "Claude",
  manual: "Manual",
};

export default function ExecutionList({
  executions,
  showSkillName = false,
  highlightId,
}: {
  executions: ExecutionItem[];
  showSkillName?: boolean;
  highlightId?: string | null;
}) {
  if (executions.length === 0) {
    return (
      <p className="text-sm text-muted border border-dashed border-line rounded-lg p-6 text-center">
        Nenhuma execução ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-2 animate-stagger">
      {executions.map((execution) => (
        <ExecutionRow
          key={execution.id}
          execution={execution}
          showSkillName={showSkillName}
          highlighted={execution.id === highlightId}
        />
      ))}
    </ul>
  );
}

function ExecutionRow({
  execution,
  showSkillName,
  highlighted,
}: {
  execution: ExecutionItem;
  showSkillName: boolean;
  highlighted?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li
      className={`rounded-lg border bg-white transition-shadow hover:shadow-sm ${
        highlighted ? "border-primary/40 animate-highlight" : "border-line"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <StatusBadge status={execution.status} />
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          {SOURCE_ICONS[execution.source]}
          {SOURCE_LABELS[execution.source] ?? execution.source}
        </span>
        {showSkillName && execution.skill && (
          <Link
            href={`/skills/${execution.skill.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            {execution.skill.name}
          </Link>
        )}
        <span className="ml-auto text-xs text-muted">
          {new Date(execution.startedAt).toLocaleString("pt-BR")}
        </span>
        <ChevronDown
          size={14}
          className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <div className="border-t border-line px-4 py-3 space-y-3 text-sm animate-fade-in">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted mb-1">Prompt enviado</div>
            <pre className="whitespace-pre-wrap break-words bg-canvas rounded-md p-3 text-ink/80 text-xs max-h-64 overflow-y-auto">
              {execution.promptSnapshot}
            </pre>
          </div>
          {execution.result && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted mb-1">Resultado</div>
              <pre className="whitespace-pre-wrap break-words bg-emerald-50 rounded-md p-3 text-ink/80 text-xs max-h-64 overflow-y-auto">
                {execution.result}
              </pre>
            </div>
          )}
          {execution.error && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted mb-1">Erro</div>
              <pre className="whitespace-pre-wrap break-words bg-red-50 rounded-md p-3 text-red-800 text-xs max-h-64 overflow-y-auto">
                {execution.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
