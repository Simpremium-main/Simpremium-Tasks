"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  Copy,
  Search,
  Send,
  X,
} from "lucide-react";

export interface ApiLogItem {
  id: string;
  skillId: string | null;
  skillName: string | null;
  fieldKey: string | null;
  direction: "input" | "output";
  kind: "fetch" | "test" | "raw" | "send";
  url: string;
  method: string;
  requestHeaders: Record<string, string> | null;
  requestBody: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  createdAt: string;
}

const KIND_LABELS: Record<ApiLogItem["kind"], string> = {
  fetch: "busca (real)",
  test: "teste de mapeamento",
  raw: "resposta bruta",
  send: "envio (retorno)",
};

export default function ApiLogsList({ logs }: { logs: ApiLogItem[] }) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"all" | "input" | "output">("all");
  const [detailsFor, setDetailsFor] = useState<ApiLogItem | null>(null);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (direction !== "all" && log.direction !== direction) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        log.url.toLowerCase().includes(q) ||
        (log.skillName?.toLowerCase().includes(q) ?? false) ||
        (log.fieldKey?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [logs, query, direction]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por URL, skill ou campo..."
            className="w-full rounded-md border border-line bg-surface pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
          {(["all", "input", "output"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                direction === d ? "bg-primary text-white" : "text-muted hover:bg-canvas"
              }`}
            >
              {d === "all" ? "Tudo" : d === "input" ? "Entrada" : "Saída"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted border border-dashed border-line rounded-lg p-6 text-center">
          {logs.length === 0
            ? "Nenhuma requisição registrada ainda — aparece aqui assim que um campo com fonte de API buscar algo, ou um retorno via API enviar algo."
            : "Nenhum resultado pra esse filtro."}
        </p>
      ) : (
        <ul className="space-y-2 animate-stagger">
          {filtered.map((log) => (
            <LogRow key={log.id} log={log} onViewDetails={() => setDetailsFor(log)} />
          ))}
        </ul>
      )}

      {detailsFor && <LogDetailsModal log={detailsFor} onClose={() => setDetailsFor(null)} />}
    </div>
  );
}

function LogRow({ log, onViewDetails }: { log: ApiLogItem; onViewDetails: () => void }) {
  const failed = Boolean(log.error);
  return (
    <li
      className={`rounded-lg border bg-surface transition-shadow hover:shadow-sm ${
        failed ? "border-red-200 bg-red-50/30" : "border-line"
      }`}
    >
      <button type="button" onClick={onViewDetails} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <span className={`mt-0.5 shrink-0 ${log.direction === "input" ? "text-primary" : "text-cowork"}`}>
          {log.direction === "input" ? <ArrowDownToLine size={15} /> : <Send size={15} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {failed ? (
              <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                <AlertTriangle size={11} />
                falhou
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                <Check size={11} />
                {log.responseStatus ?? "ok"}
              </span>
            )}
            <span className="text-xs text-muted">{KIND_LABELS[log.kind]}</span>
            {log.skillName && (
              <Link
                href={log.skillId ? `/skills/${log.skillId}` : "#"}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-ink hover:text-primary transition-colors truncate max-w-[200px]"
              >
                {log.skillName}
              </Link>
            )}
            {log.fieldKey && <span className="text-xs text-muted">campo: {log.fieldKey}</span>}
          </div>
          <p className="mt-1 text-xs font-mono text-ink/70 truncate">
            {log.method} {log.url}
          </p>
          {log.error && <p className="mt-0.5 text-xs text-red-600 truncate">{log.error}</p>}
        </div>
        <span className="shrink-0 text-xs text-muted">
          {new Date(log.createdAt).toLocaleString("pt-BR")}
        </span>
      </button>
    </li>
  );
}

function LogDetailsModal({ log, onClose }: { log: ApiLogItem; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl border border-line max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              {log.direction === "input" ? "Entrada — busca de dados" : "Saída — retorno via API"} ·{" "}
              {KIND_LABELS[log.kind]}
            </p>
            <p className="mt-0.5 text-sm font-mono break-all">
              {log.method} {log.url}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted hover:text-ink rounded-md p-1 hover:bg-canvas transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted mb-4">
          <span>{new Date(log.createdAt).toLocaleString("pt-BR")}</span>
          {log.skillName && (
            <>
              <span>·</span>
              <Link href={log.skillId ? `/skills/${log.skillId}` : "#"} className="text-primary hover:underline">
                {log.skillName}
              </Link>
            </>
          )}
          {log.fieldKey && (
            <>
              <span>·</span>
              <span>campo: {log.fieldKey}</span>
            </>
          )}
          {log.responseStatus !== null && (
            <>
              <span>·</span>
              <span>HTTP {log.responseStatus}</span>
            </>
          )}
        </div>

        {log.error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            {log.error}
          </div>
        )}

        {log.requestHeaders && Object.keys(log.requestHeaders).length > 0 && (
          <DetailBlock label="Headers enviados (mascarados)" text={JSON.stringify(log.requestHeaders, null, 2)} />
        )}
        {log.requestBody && <DetailBlock label="Corpo enviado" text={prettyOrRaw(log.requestBody)} />}
        {log.responseBody ? (
          <DetailBlock label="Resposta recebida" text={prettyOrRaw(log.responseBody)} />
        ) : (
          !log.error && <p className="text-xs text-muted">Sem corpo de resposta.</p>
        )}
      </div>
    </div>
  );
}

function prettyOrRaw(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function DetailBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-md bg-canvas p-3 text-xs text-ink/80 max-h-64 overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}
