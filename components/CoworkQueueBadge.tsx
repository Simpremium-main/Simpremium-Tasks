"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2, Pause, Play } from "lucide-react";

const REFRESH_INTERVAL_MS = 20 * 1000;

interface QueueSummary {
  waiting: number;
  inProgress: number;
  paused: boolean;
}

/**
 * A small live pill showing how many Cowork jobs are queued vs. actively
 * being worked on — otherwise the only way to know is to go dig through
 * Supabase (exactly what a whole debugging session had to resort to, since
 * a "running" execution alone doesn't say whether the agent has even
 * touched it yet). Polls the same way CoworkAgentStatus does, independent
 * of a full page reload. Also doubles as the queue's kill switch: pausing
 * stops claimNextCoworkJob from handing anything new to the agent, without
 * needing to kill mac-agent/agent.js on the Mac mini itself.
 */
export default function CoworkQueueBadge({ initialSummary }: { initialSummary: QueueSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/cowork-queue");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setSummary({ waiting: data.waiting ?? 0, inProgress: data.inProgress ?? 0, paused: Boolean(data.paused) });
        }
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

  async function togglePause() {
    const next = !summary.paused;
    setSummary((prev) => ({ ...prev, paused: next }));
    setToggling(true);
    try {
      const res = await fetch("/api/cowork-queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSummary({ waiting: data.waiting ?? 0, inProgress: data.inProgress ?? 0, paused: Boolean(data.paused) });
    } catch {
      setSummary((prev) => ({ ...prev, paused: !next }));
    } finally {
      setToggling(false);
    }
  }

  const total = summary.waiting + summary.inProgress;
  if (total === 0 && !summary.paused) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
        summary.paused ? "border-amber-200 bg-amber-50 text-amber-700" : "border-cowork/30 bg-cowork-soft text-cowork"
      }`}
    >
      <Bot size={12} />
      {summary.paused ? (
        <span title="Novas tarefas não serão entregues ao agente até você retomar a fila.">
          fila pausada
          {total > 0 && ` (${total} esperando)`}
        </span>
      ) : (
        <span title={`${summary.waiting} aguardando o agente pegar · ${summary.inProgress} sendo trabalhada${summary.inProgress === 1 ? "" : "s"} pelo Cowork agora`}>
          {summary.inProgress > 0 && <Loader2 size={11} className="inline animate-spin mr-1" />}
          {summary.waiting} aguardando · {summary.inProgress} em andamento
        </span>
      )}
      <button
        type="button"
        onClick={togglePause}
        disabled={toggling}
        title={summary.paused ? "Retomar a fila do Cowork" : "Pausar a fila do Cowork (nada de novo é entregue ao agente)"}
        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors disabled:opacity-50"
      >
        {summary.paused ? <Play size={11} /> : <Pause size={11} />}
      </button>
    </span>
  );
}
