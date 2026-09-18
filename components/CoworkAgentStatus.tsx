"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { formatDuration } from "@/lib/duration";

// The agent polls every 15s by default (mac-agent/.env.example's
// POLL_INTERVAL_MS) — a couple of missed cycles is normal jitter, not a
// real problem, so "stale" needs real headroom above that before it's
// worth flagging as possibly down.
const STALE_AFTER_MS = 90 * 1000;
// How often this component re-checks the dashboard for a fresher
// last-seen timestamp — independent of the ticking "há Xs" display below,
// which updates every second on its own.
const REFRESH_INTERVAL_MS = 20 * 1000;

/**
 * A small live pill showing when the Mac mini's Cowork agent last polled
 * this dashboard (see lib/cowork.ts / app/api/cowork-agent/next-job) —
 * otherwise the only way to know it's actually running is to go look at
 * its own terminal output. `initialLastSeenAt` comes from the server
 * render for an instant first paint; after that this polls
 * /api/cowork-agent/status on its own to stay live without a full page
 * refresh.
 */
export default function CoworkAgentStatus({ initialLastSeenAt }: { initialLastSeenAt: string | null }) {
  const [lastSeenAt, setLastSeenAt] = useState(initialLastSeenAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/cowork-agent/status");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setLastSeenAt(data.lastSeenAt ?? null);
      } catch {
        // Best-effort — a failed refresh just leaves the last known value
        // showing until the next successful poll.
      }
    };
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!lastSeenAt) {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs text-muted"
        title="O agente do Mac mini ainda não fez nenhuma consulta a este dashboard — confira mac-agent/README.md."
      >
        <Bot size={12} />
        Agente Cowork: nunca conectou
      </span>
    );
  }

  const ageMs = now - new Date(lastSeenAt).getTime();
  const isLive = ageMs <= STALE_AFTER_MS;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
        isLive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
      title={
        isLive
          ? "O agente do Mac mini está consultando este dashboard normalmente."
          : "O agente não consulta este dashboard há um tempo — confira se o processo ainda está rodando no Mac mini."
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        {isLive && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-amber-500"}`} />
      </span>
      <Bot size={12} />
      Agente {isLive ? "ativo" : "inativo"} — visto há {formatDuration(ageMs)}
    </span>
  );
}
