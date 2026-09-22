"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Clock, Hand, Loader2, Sparkles, CalendarClock } from "lucide-react";
import { formatDuration } from "@/lib/duration";

const REFRESH_INTERVAL_MS = 15 * 1000;

interface ActiveExecutionItem {
  id: string;
  status: string;
  source: string;
  coworkStartedAt: string | null;
  startedAt: string;
  skill: { id: string; name: string };
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  cowork: <Bot size={12} />,
  claude: <Sparkles size={12} />,
  manual: <Hand size={12} />,
  scheduled: <CalendarClock size={12} />,
};

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Same "queued vs. actively worked on" distinction CoworkQueueBadge and
 *  ExecutionList's coworkPhaseLabel use, kept local here since this is the
 *  only other place that needs it and it's a handful of lines. */
function phaseLabel(execution: ActiveExecutionItem, now: number): string {
  if (execution.source === "cowork" && execution.status === "running") {
    if (!execution.coworkStartedAt) return "na fila";
    return `há ${formatDuration(now - new Date(execution.coworkStartedAt).getTime())}`;
  }
  return `há ${formatDuration(now - new Date(execution.startedAt).getTime())}`;
}

/**
 * A compact, always-live view of every execution currently pending/running
 * across every skill — so "is anything running right now?" doesn't require
 * opening each skill or digging through /history. Polls independently of
 * whatever else is on the homepage, and keeps polling even while empty
 * (unlike RunSkillPanel/HistoryBoard's polling, which only starts once they
 * already know something's running from server-rendered props) since new
 * work can start at any time from a schedule or another browser tab.
 */
export default function ActiveExecutionsStrip({
  initialExecutions,
}: {
  initialExecutions: ActiveExecutionItem[];
}) {
  const [executions, setExecutions] = useState(initialExecutions);
  const now = useNow(1000);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/executions/active");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setExecutions(data);
      } catch {
        // Best-effort — leaves the last known list showing.
      }
    };
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (executions.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted uppercase tracking-wide">
        <Loader2 size={12} className="animate-spin text-primary" />
        Rodando agora ({executions.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {executions.map((execution) => (
          <Link
            key={execution.id}
            href={`/skills/${execution.skill.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
          >
            {SOURCE_ICONS[execution.source]}
            <span className="max-w-[200px] truncate font-medium">{execution.skill.name}</span>
            <span className="inline-flex items-center gap-1 text-muted">
              <Clock size={11} />
              {phaseLabel(execution, now)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
