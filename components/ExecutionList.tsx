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
  ListOrdered,
  Loader2,
  Paperclip,
  RotateCcw,
  Sparkles,
  Star,
  Timer,
  User,
  X,
  XCircle,
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
  /** A Cowork run's own step-by-step account of what it did, in order — see
   *  lib/types.ts's DispatchResult.steps. Always null for other sources. */
  steps: string[] | null;
  usage: ExecutionUsageItem | null;
  ranBy: string | null;
  favorite: boolean;
  /** Null while a Cowork job still sits in the queue; set once the agent
   *  actually starts driving Cowork for it (see mac-agent/agent.js's
   *  markStarted). Only meaningful when source is "cowork". */
  coworkStartedAt: string | null;
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

// Nothing in this app drives a Claude-direct run forward except the browser
// tab that started it (no server-side/cron continuation) — so a "running"
// row is only ever still legitimately in flight while that tab stays open.
// Once a row has sat at "running" for longer than a single chunk could
// plausibly take (dispatchClaudeChunk is bounded to ~280s), it's almost
// certainly orphaned: the tab was closed, or the process was hard-killed by
// the platform before withFailureRecorded's own cleanup could run. This is
// a soft, time-based warning, not a certainty — flagged instead of
// asserted, since another open tab or device could still genuinely be
// driving it.
const STUCK_AFTER_MS = 5 * 60 * 1000;

// A queued Cowork job is different: nothing about it depends on a browser
// tab staying open (the Mac mini agent drives it server-side, polling
// independently — see lib/cowork.ts), and it can legitimately take several
// minutes for the agent to pick it up, drive Cowork, and wait for a result
// file. The agent's own default timeout before it gives up and reports an
// error is 20 minutes (mac-agent/.env.example's RESULT_TIMEOUT_MS), so
// flagging "stuck" well before that would just be wrong most of the time.
const COWORK_STUCK_AFTER_MS = 25 * 60 * 1000;

function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function isLikelyStuck(execution: ExecutionItem, now: number): boolean {
  if (execution.status !== "running") return false;
  const threshold = execution.source === "cowork" ? COWORK_STUCK_AFTER_MS : STUCK_AFTER_MS;
  return now - new Date(execution.startedAt).getTime() > threshold;
}

/** A "running" Cowork execution could mean two very different things: still
 *  sitting in the queue (nobody's touched it yet), or actively being worked
 *  on by the agent right now — coworkStartedAt is the only thing that tells
 *  them apart. Returns null for anything that isn't a running Cowork job. */
function coworkPhaseLabel(execution: ExecutionItem, now: number): string | null {
  if (execution.status !== "running" || execution.source !== "cowork") return null;
  if (!execution.coworkStartedAt) return "aguardando o agente";
  const elapsedMs = now - new Date(execution.coworkStartedAt).getTime();
  return `Cowork trabalhando há ${formatDuration(elapsedMs)}`;
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
  favoritable = true,
  onFavoriteChange,
  onCancel,
}: {
  executions: ExecutionItem[];
  showSkillName?: boolean;
  highlightId?: string | null;
  /** Present only on the skill's own page (RunSkillPanel owns the run form
   *  to prefill) — the global history list has no form to retry into. */
  onRetry?: (execution: ExecutionItem) => void;
  /** False on the public /share/[token] page — that view is read-only, no
   *  login required, so it can't let an anonymous visitor mutate anything. */
  favoritable?: boolean;
  /** Lets a parent holding its own copy of the list (HistoryBoard, for its
   *  "Favoritas" filter) stay in sync after a toggle — this component
   *  itself only owns the optimistic per-row display, not the source list. */
  onFavoriteChange?: (id: string, favorite: boolean) => void;
  /** Present wherever a run can actually be cancelled (not on the read-only
   *  /share/[token] page) — lets the parent PATCH the cancel and update its
   *  own copy of the list, same pattern as onFavoriteChange. */
  onCancel?: (execution: ExecutionItem) => void;
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
            coworkPhase={coworkPhaseLabel(execution, now)}
            onViewDetails={() => setDetailsFor(execution)}
            onRetry={onRetry ? () => retry(execution) : undefined}
            favoritable={favoritable}
            onFavoriteChange={onFavoriteChange}
            onCancel={onCancel}
          />
        ))}
      </ul>
      {detailsFor && (
        <ExecutionDetailsModal
          execution={detailsFor}
          stuck={isLikelyStuck(detailsFor, now)}
          coworkPhase={coworkPhaseLabel(detailsFor, now)}
          onClose={() => setDetailsFor(null)}
          onRetry={onRetry ? () => retry(detailsFor) : undefined}
          favoritable={favoritable}
          onFavoriteChange={onFavoriteChange}
          onCancel={
            onCancel
              ? (execution) => {
                  onCancel(execution);
                  setDetailsFor(null);
                }
              : undefined
          }
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
  coworkPhase,
  onViewDetails,
  onRetry,
  favoritable,
  onFavoriteChange,
  onCancel,
}: {
  execution: ExecutionItem;
  showSkillName: boolean;
  highlighted?: boolean;
  stuck: boolean;
  coworkPhase: string | null;
  onViewDetails: () => void;
  onRetry?: () => void;
  favoritable: boolean;
  onFavoriteChange?: (id: string, favorite: boolean) => void;
  onCancel?: (execution: ExecutionItem) => void;
}) {
  const failedScheduled = isFailedScheduled(execution);
  const durationMs = executionDurationMs(execution.startedAt, execution.finishedAt);
  const previewText = execution.result || execution.error;
  return (
    <li
      className={`group/row relative rounded-lg border bg-surface transition-shadow hover:shadow-sm ${
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
          {coworkPhase && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-xs text-cowork bg-cowork-soft rounded-full px-2 py-0.5"
              title={
                execution.coworkStartedAt
                  ? "O agente do Mac mini já pegou essa tarefa e está trabalhando nela agora."
                  : "Ainda na fila — o agente do Mac mini ainda não pegou essa tarefa."
              }
            >
              <Bot size={11} />
              {coworkPhase}
            </span>
          )}
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
          {execution.steps && execution.steps.length > 0 && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-xs text-muted"
              title={`${execution.steps.length} passo(s) registrado(s)`}
            >
              <ListOrdered size={11} />
              {execution.steps.length}
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
        {favoritable && (
          <FavoriteToggle
            executionId={execution.id}
            favorite={execution.favorite}
            onChange={onFavoriteChange}
          />
        )}
        <CopyPromptButton text={execution.promptSnapshot} />
        {onCancel && (execution.status === "pending" || execution.status === "running") && (
          <CancelExecutionButton execution={execution} stuck={stuck} onCancelled={onCancel} />
        )}
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
      {previewText && (
        <div className="pointer-events-none absolute left-3 right-3 top-full z-20 mt-1.5 hidden group-hover/row:block animate-fade-in">
          <div className="relative rounded-lg border border-line bg-surface p-3 text-xs text-ink/70 shadow-lg">
            <p className="line-clamp-4 whitespace-pre-wrap break-words">{previewText}</p>
            <p className="mt-1.5 text-[10px] uppercase tracking-wide text-muted">
              {execution.result ? "prévia do resultado" : "prévia do erro"} — clique pra ver tudo
            </p>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Starred by hand — "this was the good run" among several attempts, nothing
 * else in the app reads it. Optimistic: flips immediately on click, PATCHes
 * in the background, and reverts if that fails. `onChange` is only there so
 * a parent holding its own copy of the list (HistoryBoard's "Favoritas"
 * filter) can stay in sync — this component doesn't own that source list.
 */
function FavoriteToggle({
  executionId,
  favorite,
  onChange,
}: {
  executionId: string;
  favorite: boolean;
  onChange?: (id: string, favorite: boolean) => void;
}) {
  const [current, setCurrent] = useState(favorite);
  const [working, setWorking] = useState(false);

  useEffect(() => setCurrent(favorite), [favorite]);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !current;
    setCurrent(next);
    setWorking(true);
    try {
      const res = await fetch(`/api/executions/${executionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) throw new Error();
      onChange?.(executionId, next);
    } catch {
      setCurrent(!next);
    } finally {
      setWorking(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={working}
      title={current ? "Remover dos favoritos" : "Marcar como favorita"}
      className={`shrink-0 transition-colors disabled:opacity-60 ${
        current ? "text-amber-500" : "text-muted hover:text-amber-500"
      }`}
    >
      <Star size={15} className={current ? "fill-current" : ""} />
    </button>
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

/**
 * Marks a "pending"/"running" execution as manually cancelled — the UI
 * replacement for the only escape hatch this app used to have for a stuck
 * run: going into Supabase's SQL editor and deleting the row by hand.
 * Two clicks on purpose (arms, then confirms) since this overwrites the
 * row's final status and can't be undone; `stuck` just makes the first
 * click's button read more like a suggestion than a rarely-needed option.
 */
function CancelExecutionButton({
  execution,
  stuck,
  onCancelled,
}: {
  execution: ExecutionItem;
  stuck: boolean;
  onCancelled: (execution: ExecutionItem) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(e: React.MouseEvent) {
    e.stopPropagation();
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/executions/${execution.id}/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao cancelar (HTTP ${res.status})`);
      onCancelled({
        ...execution,
        status: body.status,
        error: body.error,
        finishedAt: body.finishedAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar");
      setWorking(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={confirm}
          disabled={working}
          title="Confirmar cancelamento"
          className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white px-2 py-1 text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
        >
          {working ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
          Confirmar?
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(false);
          }}
          disabled={working}
          title="Voltar"
          className="text-muted hover:text-ink transition-colors disabled:opacity-40"
        >
          <X size={13} />
        </button>
      </span>
    );
  }

  return (
    <span className="shrink-0 flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        title={
          stuck
            ? "Essa execução está rodando há bastante tempo — provavelmente travou. Cancelar libera o histórico e para de esperar por um resultado que talvez nunca chegue."
            : "Cancela essa execução e marca como erro"
        }
        className={`inline-flex items-center gap-1 text-xs transition-colors ${
          stuck ? "text-amber-700 hover:text-red-600" : "text-muted hover:text-red-600"
        }`}
      >
        <XCircle size={13} />
        <span className="hidden sm:inline">Cancelar</span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

function ExecutionDetailsModal({
  execution,
  stuck,
  coworkPhase,
  onClose,
  onRetry,
  favoritable,
  onFavoriteChange,
  onCancel,
}: {
  execution: ExecutionItem;
  stuck: boolean;
  coworkPhase: string | null;
  onClose: () => void;
  onRetry?: () => void;
  favoritable: boolean;
  onFavoriteChange?: (id: string, favorite: boolean) => void;
  onCancel?: (execution: ExecutionItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<"resultado" | "passos">("resultado");
  const fileBase = `execucao-${execution.id.slice(0, 8)}`;
  const durationMs = executionDurationMs(execution.startedAt, execution.finishedAt);

  // Screenshots ride the same `files` array as any other generated file
  // (see lib/types.ts's ExecutionFile) — split by MIME type here so they
  // land in the "Passo a passo" tab as a gallery instead of the plain
  // download list, while keeping each file's original index (the download
  // route addresses files by position in the *full* array, not the
  // filtered one).
  const filesWithIndex = (execution.files ?? []).map((file, i) => ({ file, i }));
  const imageFiles = filesWithIndex.filter(({ file }) => file.mimeType.startsWith("image/"));
  const otherFiles = filesWithIndex.filter(({ file }) => !file.mimeType.startsWith("image/"));
  const hasStepsTab = Boolean(execution.steps?.length) || imageFiles.length > 0;

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
            {coworkPhase && (
              <span className="inline-flex items-center gap-1 text-xs text-cowork bg-cowork-soft rounded-full px-2 py-0.5">
                <Bot size={11} />
                {coworkPhase}
              </span>
            )}
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
          <div className="flex items-center gap-1 shrink-0">
            {favoritable && (
              <FavoriteToggle
                executionId={execution.id}
                favorite={execution.favorite}
                onChange={onFavoriteChange}
              />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="text-muted hover:text-ink rounded-md p-1 hover:bg-canvas transition-colors"
            >
              <X size={16} />
            </button>
          </div>
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

        {hasStepsTab && (
          <div className="flex items-center gap-1 mb-4 border-b border-line">
            <TabButton active={activeTab === "resultado"} onClick={() => setActiveTab("resultado")}>
              Resultado
            </TabButton>
            <TabButton active={activeTab === "passos"} onClick={() => setActiveTab("passos")}>
              <ListOrdered size={13} />
              Passo a passo
            </TabButton>
          </div>
        )}

        {(!hasStepsTab || activeTab === "resultado") && (
          <>
            <DetailBlock label="Prompt enviado" text={execution.promptSnapshot} tone="canvas" />

            {otherFiles.length > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-wide text-muted mb-1.5">
                  Arquivo{otherFiles.length > 1 ? "s" : ""} gerado{otherFiles.length > 1 ? "s" : ""}
                </div>
                <div className="space-y-1.5">
                  {otherFiles.map(({ file, i }) => (
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
          </>
        )}

        {hasStepsTab && activeTab === "passos" && (
          <div className="mb-4 space-y-4">
            {execution.steps && execution.steps.length > 0 && (
              <ol className="space-y-1.5 rounded-md bg-canvas p-3 text-sm text-ink/80">
                {execution.steps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-muted">{i + 1}.</span>
                    <span className="min-w-0 break-words">{step}</span>
                  </li>
                ))}
              </ol>
            )}
            {imageFiles.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted mb-1.5">
                  Print{imageFiles.length > 1 ? "s" : ""} de tela
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {imageFiles.map(({ file, i }) => (
                    <a
                      key={i}
                      href={`/api/executions/${execution.id}/files/${i}`}
                      target="_blank"
                      rel="noreferrer"
                      title={file.name}
                      className="group block rounded-md border border-line overflow-hidden hover:border-primary/40 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/executions/${execution.id}/files/${i}`}
                        alt={file.name}
                        className="h-24 w-full object-cover bg-canvas"
                      />
                      <div className="flex items-center justify-between gap-1 px-1.5 py-1 text-[11px] text-muted group-hover:text-primary">
                        <span className="truncate">{file.name}</span>
                        <Download size={11} className="shrink-0" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
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
          {onCancel && (execution.status === "pending" || execution.status === "running") && (
            <CancelExecutionButton execution={execution} stuck={stuck} onCancelled={onCancel} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
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
