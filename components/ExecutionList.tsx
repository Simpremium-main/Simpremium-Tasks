"use client";

import { useState } from "react";
import Link from "next/link";
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

const SOURCE_LABELS: Record<string, string> = {
  cowork: "🤝 Cowork",
  claude: "✦ Claude",
  manual: "🖐 Manual",
};

export default function ExecutionList({
  executions,
  showSkillName = false,
}: {
  executions: ExecutionItem[];
  showSkillName?: boolean;
}) {
  if (executions.length === 0) {
    return (
      <p className="text-sm text-ink/50 border border-dashed border-line rounded-lg p-6 text-center">
        No runs yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {executions.map((execution) => (
        <ExecutionRow key={execution.id} execution={execution} showSkillName={showSkillName} />
      ))}
    </ul>
  );
}

function ExecutionRow({
  execution,
  showSkillName,
}: {
  execution: ExecutionItem;
  showSkillName: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-lg border border-line bg-white">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <StatusBadge status={execution.status} />
        <span className="text-xs text-ink/50">{SOURCE_LABELS[execution.source] ?? execution.source}</span>
        {showSkillName && execution.skill && (
          <Link
            href={`/skills/${execution.skill.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium hover:text-accent transition-colors"
          >
            {execution.skill.name}
          </Link>
        )}
        <span className="ml-auto text-xs text-ink/50">
          {new Date(execution.startedAt).toLocaleString()}
        </span>
        <span className="text-ink/40 text-xs">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="border-t border-line px-4 py-3 space-y-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Prompt sent</div>
            <pre className="whitespace-pre-wrap break-words bg-canvas rounded-md p-3 text-ink/80 text-xs">
              {execution.promptSnapshot}
            </pre>
          </div>
          {execution.result && (
            <div>
              <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Result</div>
              <pre className="whitespace-pre-wrap break-words bg-emerald-50 rounded-md p-3 text-ink/80 text-xs">
                {execution.result}
              </pre>
            </div>
          )}
          {execution.error && (
            <div>
              <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Error</div>
              <pre className="whitespace-pre-wrap break-words bg-red-50 rounded-md p-3 text-red-800 text-xs">
                {execution.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
