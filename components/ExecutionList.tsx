"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  Coins,
  Copy,
  Download,
  Eye,
  FileText,
  Hand,
  Paperclip,
  RotateCcw,
  Sparkles,
  Timer,
  User,
  X,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import ChainResultButton from "./ChainResultButton";
import { downloadPdf, downloadText } from "@/lib/exportResult";
import { estimateCostUsd, formatCostUsd, formatTokens, totalTokens } from "@/lib/cost";
import { executionDurationMs, formatDuration } from "@/lib/duration";

export interface ExecutionFileItem {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ExecutionUsageItem {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface ExecutionItem {
  id: string;
  status: string;
  source: string;
  inputValues: Record<string, string> | null;
  promptSnapshot: string;
  result: string | null;
  error: string | null;
  files: ExecutionFileItem[] | null;
  usage: ExecutionUsageItem | null;
  ranBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  skill?: { id: string; name: string };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  cowork: <Bot size={13} />,
  claude: <Sparkles size={13} />,
  manual: <Hand size={13} />,
  scheduled: <CalendarClock size={13} />,
};

const SOURCE_LABELS: Record<string, string> = {
  cowork: "Cowork",
  claude: "Claude",
  manual: "Manual",
  scheduled: "Agendado",
};

// Nothing in this app drives a run forward except the browser tab that
// started it (no server-side/cron continuation) — so a "running" row is
// only ever still legitimately in flight while that tab stays open. Once a
// row has sat at "running" for longer than a single chunk could plausibly
// take (dispatchClaudeChunk is bounded to ~280s), it's almost certainly
// orphaned: the tab was closed, or the process was hard-killed by the
// platform before withFailureRecorded's own cleanup could run. This is a
// soft, time-based warning, not a certainty — flagged instead of asserted,
// since another open tab or device could still genuinely be driving it.
const STUCK_AFTER_MS = 5 * 60 * 1000;

function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function isLikelyStuck(execution: ExecutionItem, now: number): boolean {
  return execution.status === "running" && now - new Date(execution.startedAt).getTime() > STUCK_AFTER_MS;
}

// A scheduled run that failed is easy to miss compared to a manual one — you
// were there when you clicked "Rodar" and saw the error immediately; nobody
// was watching this one, so it deserves to stand out instead of blending
// into the rest of the list.
function isFailedScheduled(execution: ExecutionItem): boolean {
  return execution.source === "scheduled" && (execution.status === "error" || execution.status === "needs_setup");
}

export default function ExecutionList({
  executions,
  showSkillName = false,
  highlightId,
  onRetry,
}: {
  executions: ExecutionItem[];
  showSkillName?: boolean;
  highlightId?: string | null;
  /** Present only on the skill's own page (RunSkillPanel owns the run form
   *  to prefill) — the global history list has no form to retry into. */
  onRetry?: (execution: ExecutionItem) => void;
}) {
  const [detailsFor, setDetailsFor] = useState<ExecutionItem | null>(null);
  // Only running while some row is actually "running" — no point ticking a
  // 30s timer forever on a history page full of finished executions.
  const anyRunning = executions.some((e) => e.status === "running");
  const now = useTicker(anyRunning ? 30_000 : 3_600_000);

  if (executions.length === 0) {
    return (
      <p className="text-sm text-muted border border-dashed border-line rounded-lg p-6 text-center">
        Nenhuma execução ainda.
      </p>
    );
  }

  function retry(execution: ExecutionItem) {
    onRetry?.(execution);
    setDetailsFor(null);
  }

  return (
    <>
      <ul className="space-y-2 animate-stagger">
        {executions.map((execution) => (
          <ExecutionRow
            key={execution.id}
            execution={execution}
            showSkillName={showSkillName}
            highlighted={execution.id === highlightId}
            stuck={isLikelyStuck(execution, now)}
            onViewDetails={() => setDetailsFor(execution)}
            onRetry={onRetry ? () => retry(execution) : undefined}
          />
        ))}
      </ul>
      {detailsFor && (
        <ExecutionDetailsModal
          execution={detailsFor}
          stuck={isLikelyStuck(detailsFor, now)}
          onClose={() => setDetailsFor(null)}
          onRetry={onRetry ? () => retry(detailsFor) : undefined}
        />
      )}
    </>
  );
}

function ExecutionRow({
  execution,
  showSkillName,
  highlighted,
  stuck,
  onViewDetails,
  onRetry,
}: {
  execution: ExecutionItem;
  showSkillName: boolean;
  highlighted?: boolean;
  stuck: boolean;
  onViewDetails: () => void;
  onRetry?: () => void;
}) {
  const failedScheduled = isFailedScheduled(execution);
  const durationMs = executionDurationMs(execution.startedAt, execution.finishedAt);
  return (
    <li
      className={`rounded-lg border bg-surface transition-shadow hover:shadow-sm ${
        highlighted
          ? "border-primary/40 animate-highlight"
          : failedScheduled
            ? "border-red-200 bg-red-50/30"
            : "border-line"
      }`}
    >
      <div className="w-full flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onViewDetails} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <StatusBadge status={execution.status} />
          {stuck && (
            <span
              className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded-full px-2 py-0.5"
              title="Passou de 5 minutos rodando — nada nesse app continua uma execução sozinho depois que a aba que a iniciou fecha, então isso provavelmente travou."
            >
              <AlertTriangle size={11} />
              demorando
            </span>
          )}
          {failedScheduled && (
            <span
              className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5"
              title="Rodou sozinha pelo agendamento e falhou — ninguém estava vendo na hora."
            >
              <AlertTriangle size={11} />
              falhou sozinha
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            {SOURCE_ICONS[execution.source]}
            {SOURCE_LABELS[execution.source] ?? execution.source}
          </span>
          {execution.ranBy && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted">
              <User size={11} />
              {execution.ranBy}
            </span>
          )}
          {execution.files && execution.files.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs text-primary"
              title={`${execution.files.length} arquivo(s) gerado(s)`}
            >
              <Paperclip size={11} />
              {execution.files.length}
            </span>
          )}
          {execution.usage && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-xs text-muted"
              title={`${execution.usage.inputTokens} tokens de entrada, ${execution.usage.outputTokens} de saída${execution.usage.cacheReadInputTokens ? `, ${execution.usage.cacheReadInputTokens} lidos do cache` : ""} — estimativa de custo, não a cobrança real`}
            >
              <Coins size={11} />
              {formatTokens(totalTokens(execution.usage))} tok · ~
              {formatCostUsd(estimateCostUsd(execution.usage))}
            </span>
          )}
          {durationMs !== null && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-xs text-muted"
              title="Tempo total da execução, do início ao fim (todos os passos, se precisou de mais de um)"
            >
              <Timer size={11} />
              {formatDuration(durationMs)}
            </span>
          )}
          {showSkillName && execution.skill && (
            <Link
              href={`/skills/${execution.skill.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              {execution.skill.name}
            </Link>
          )}
          <span className="ml-auto text-xs text-muted hidden sm:inline">
            {new Date(execution.startedAt).toLocaleString("pt-BR")}
          </span>
        </button>
        <CopyPromptButton text={execution.promptSnapshot} />
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            title="Rodar de novo"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors shrink-0"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Rodar de novo</span>
          </button>
        )}
        <button
          type="button"
          onClick={onViewDetails}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary shrink-0"
        >
          <Eye size={13} />
          <span className="hidden sm:inline">Ver detalhes</span>
        </button>
      </div>
    </li>
  );
}

/** Copies the prompt straight from the row — the details modal has its own
 *  copy button on the same text, this just saves opening it for that alone. */
function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore, button just won't confirm
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copiar prompt"
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors shrink-0"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar prompt"}</span>
    </button>
  );
}

function ExecutionDetailsModal({
  execution,
  stuck,
  onClose,
  onRetry,
}: {
  execution: ExecutionItem;
  stuck: boolean;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const fileBase = `execucao-${execution.id.slice(0, 8)}`;
  const durationMs = executionDurationMs(execution.startedAt, execution.finishedAt);

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
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={execution.status} />
            {stuck && (
              <span
                className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded-full px-2 py-0.5"
                title="Passou de 5 minutos rodando — nada nesse app continua uma execução sozinho depois que a aba que a iniciou fecha, então isso provavelmente travou."
              >
                <AlertTriangle size={11} />
                demorando
              </span>
            )}
            {isFailedScheduled(execution) && (
              <span
                className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5"
                title="Rodou sozinha pelo agendamento e falhou — ninguém estava vendo na hora."
              >
                <AlertTriangle size={11} />
                falhou sozinha
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {SOURCE_ICONS[execution.source]}
              {SOURCE_LABELS[execution.source] ?? execution.source}
            </span>
            {execution.ranBy && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <User size={11} />
                {execution.ranBy}
              </span>
            )}
            {execution.skill && (
              <Link
                href={`/skills/${execution.skill.id}`}
                className="text-xs font-medium text-primary hover:text-primary-hover"
              >
                {execution.skill.name}
              </Link>
            )}
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

        <div className="flex items-center gap-1.5 text-xs text-muted mb-4">
          <span>
            Iniciada em {new Date(execution.startedAt).toLocaleString("pt-BR")}
            {execution.finishedAt &&
              ` · finalizada em ${new Date(execution.finishedAt).toLocaleString("pt-BR")}`}
          </span>
          {durationMs !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5">
              <Timer size={11} />
              {formatDuration(durationMs)}
            </span>
          )}
        </div>

        {execution.usage && (
          <div className="mb-4 flex items-center gap-4 rounded-md border border-line bg-canvas/60 px-3 py-2 text-xs text-ink/70">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <Coins size={13} className="text-primary" />
              ~{formatCostUsd(estimateCostUsd(execution.usage))}
            </span>
            <span>{formatTokens(execution.usage.inputTokens)} tokens de entrada</span>
            <span>{formatTokens(execution.usage.outputTokens)} de saída</span>
            {Boolean(execution.usage.cacheReadInputTokens) && (
              <span title="Lidos do cache de prompt — cobrados a ~10% do preço normal de entrada">
                {formatTokens(execution.usage.cacheReadInputTokens!)} do cache
              </span>
            )}
            <span className="ml-auto text-muted/70" title="Baseado no preço público do claude-sonnet-5 — não é a cobrança real da Anthropic">
              estimativa
            </span>
          </div>
        )}

        <DetailBlock label="Prompt enviado" text={execution.promptSnapshot} tone="canvas" />

        {execution.files && execution.files.length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-1.5">
              Arquivo{execution.files.length > 1 ? "s" : ""} gerado{execution.files.length > 1 ? "s" : ""}
            </div>
            <div className="space-y-1.5">
              {execution.files.map((file, i) => (
                <a
                  key={i}
                  href={`/api/executions/${execution.id}/files/${i}`}
                  className="flex items-center gap-2 rounded-md border border-line bg-primary-soft/40 px-3 py-2 text-sm hover:border-primary/40 hover:bg-primary-soft transition-colors"
                >
                  <Paperclip size={14} className="text-primary shrink-0" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted shrink-0">{formatBytes(file.sizeBytes)}</span>
                  <Download size={13} className="text-primary shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {execution.result && (
          <DetailBlock
            label="Resultado"
            text={execution.result}
            tone="emerald"
            // Only offer the .txt/.pdf export-of-text convenience when there's
            // no real generated file — showing it next to an actual PDF/CSV
            // would look like a second, fake copy of the same thing.
            downloadBase={execution.files?.length ? undefined : fileBase}
            downloadTitle={execution.skill?.name ?? "Resultado da execução"}
          />
        )}

        {execution.error && <DetailBlock label="Erro" text={execution.error} tone="red" />}

        <div className="flex flex-wrap items-start gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
            >
              <RotateCcw size={13} />
              Rodar de novo
            </button>
          )}
          {execution.result && <ChainResultButton resultText={execution.result} />}
        </div>
      </div>
    </div>
  );
}

function DetailBlock({
  label,
  text,
  tone,
  downloadBase,
  downloadTitle,
}: {
  label: string;
  text: string;
  tone: "canvas" | "emerald" | "red";
  downloadBase?: string;
  downloadTitle?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore, copy button just won't confirm
    }
  }

  const bg = tone === "canvas" ? "bg-canvas" : tone === "emerald" ? "bg-emerald-50" : "bg-red-50";
  const textColor = tone === "red" ? "text-red-800" : "text-ink/80";

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          {downloadBase && (
            <>
              <button
                type="button"
                onClick={() => downloadText(`${downloadBase}.txt`, text)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
                title="Baixar como .txt"
              >
                <Download size={12} />
                .txt
              </button>
              <button
                type="button"
                onClick={() => downloadPdf(`${downloadBase}.pdf`, downloadTitle ?? "Resultado", text)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
                title="Baixar como PDF"
              >
                <FileText size={12} />
                PDF
              </button>
            </>
          )}
        </div>
      </div>
      <pre className={`whitespace-pre-wrap break-words rounded-md p-3 text-xs max-h-64 overflow-y-auto ${bg} ${textColor}`}>
        {text}
      </pre>
    </div>
  );
}
