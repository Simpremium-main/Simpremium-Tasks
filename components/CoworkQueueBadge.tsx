"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";

const REFRESH_INTERVAL_MS = 20 * 1000;

interface QueueSummary {
  waiting: number;
  inProgress: number;
}

/**
 * A small live pill showing how many Cowork jobs are queued vs. actively
 * being worked on — otherwise the only way to know is to go dig through
 * Supabase (exactly what a whole debugging session had to resort to, since
 * a "running" execution alone doesn't say whether the agent has even
 * touched it yet). Polls the same way CoworkAgentStatus does, independent
 * of a full page reload.
 */
export default function CoworkQueueBadge({ initialSummary }: { initialSummary: QueueSummary }) {
  const [summary, setSummary] = useState(initialSummary);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/cowork-queue");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setSummary({ waiting: data.waiting ?? 0, inProgress: data.inProgress ?? 0 });
      } catch {
        // Best-effort — leaves the last known counts showing.
      }
    };
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const total = summary.waiting + summary.inProgress;
  if (total === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-cowork/30 bg-cowork-soft px-3 py-1.5 text-xs text-cowork"
      title={`${summary.waiting} aguardando o agente pegar · ${summary.inProgress} sendo trabalhada${summary.inProgress === 1 ? "" : "s"} pelo Cowork agora`}
    >
      <Bot size={12} />
      {summary.inProgress > 0 && <Loader2 size={11} className="animate-spin" />}
      {summary.waiting} aguardando · {summary.inProgress} em andamento
    </span>
  );
}
