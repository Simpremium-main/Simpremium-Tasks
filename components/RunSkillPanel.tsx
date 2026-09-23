"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  Coins,
  FileText,
  History,
  Loader2,
  Play,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import DynamicForm from "./DynamicForm";
import ExecutionList, { type ExecutionItem } from "./ExecutionList";
import { CHAIN_INPUT_STORAGE_KEY } from "./ChainResultButton";
import { buildPromptSnapshot, looksLikeSecretKey } from "@/lib/mask";
import { estimateCostUsd, formatCostUsd } from "@/lib/cost";
import { executionDurationMs, formatDuration } from "@/lib/duration";
import type { InputField } from "@/lib/types";

interface Skill {
  id: string;
  name: string;
  promptTemplate: string;
  needsInput: boolean;
  usesCowork: boolean;
  inputSchema: InputField[] | null;
  confirmedOnce: boolean;
  /** Whether an outputCallback is configured (lib/types.ts) — only used to
   *  show the "modo teste" checkbox below; the run itself works the same
   *  either way. */
  hasOutputCallback: boolean;
}

export default function RunSkillPanel({
  skill,
  initialExecutions,
}: {
  skill: Skill;
  initialExecutions: ExecutionItem[];
}) {
  const router = useRouter();
  const schema: InputField[] = skill.inputSchema ?? [];

  // Consumed at most once, on first render: ChainResultButton (on another
  // execution's details modal) stashes a result here right before
  // navigating here, so this skill's form opens pre-filled with it instead
  // of requiring a copy-paste round trip. Picks the first textarea (or
  // plain text) field — secret/number/url/file fields wouldn't make sense
  // as a landing spot for arbitrary result text.
  const [initialFromChain] = useState<{ key: string; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const chained = sessionStorage.getItem(CHAIN_INPUT_STORAGE_KEY);
      if (!chained) return null;
      sessionStorage.removeItem(CHAIN_INPUT_STORAGE_KEY);
      const target = schema.find((f) => f.type === "textarea") ?? schema.find((f) => f.type === "text");
      return target ? { key: target.key, text: chained } : null;
    } catch {
      return null;
    }
  });

  const [values, setValues] = useState<Record<string, string>>(() =>
    initialFromChain ? { [initialFromChain.key]: initialFromChain.text } : {}
  );
  const [showConfirm, setShowConfirm] = useState(false);
  // Only meaningful when skill.hasOutputCallback — the skill still runs for
  // real either way, this only decides whether finishExecution actually
  // sends the configured callback or just records what it would have sent
  // (lib/runSkill.ts). Defaults off: a real send is the normal case.
  const [dryRun, setDryRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [executions, setExecutions] = useState(initialExecutions);
  const [formError, setFormError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(() =>
    initialFromChain ? "Preenchido com o resultado de outra execução — confira antes de rodar." : null
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState("");
  const [showThinking, setShowThinking] = useState(false);
  const [chunkNumber, setChunkNumber] = useState(1);

  const missingRequired = schema.filter((f) => f.required && !values[f.key]?.trim());

  // `executions` starts as a copy of the server-rendered `initialExecutions`
  // prop, then only ever grows locally (a freshly finished run gets prepended
  // in confirmAndRun below) — React doesn't re-run useState's initializer on
  // a prop change, so without this it would go stale forever after the first
  // render. That stale-forever gap is exactly what made a Cowork run's real
  // completion (reported minutes later, out of band, by the Mac mini agent —
  // see report-result/route.ts) invisible here: the row would sit at
  // "running" in this component's local state even after the server had
  // long since recorded a final status, until a full page reload remounted
  // the component from scratch.
  useEffect(() => {
    setExecutions(initialExecutions);
  }, [initialExecutions]);

  // Cowork's result comes back asynchronously (the Mac mini agent polls,
  // drives Cowork, then reports back — see lib/cowork.ts) — nothing in this
  // tab's own request/response cycle tells it when that happens. So while
  // any Cowork execution is still "running", poll the server component for
  // a fresh status instead of leaving the person staring at a stale
  // "running" row until they think to reload.
  useEffect(() => {
    const hasPendingCowork = executions.some((e) => e.source === "cowork" && e.status === "running");
    if (!hasPendingCowork) return;
    const interval = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(interval);
  }, [executions, router]);

  // Prefills the form from a past execution's inputs so re-running it doesn't
  // mean retyping everything — but secret fields (token/senha/etc.) are never
  // stored in plain text in history (masked before the row is even written,
  // see lib/mask.ts), so there's nothing safe to reuse for those: leave them
  // blank and tell the person why, instead of silently sending the masked
  // "••••1234" placeholder as if it were a real credential.
  function handleRetry(execution: ExecutionItem) {
    const prefill: Record<string, string> = {};
    let skippedSecrets = false;
    for (const field of schema) {
      if (field.type === "secret" || looksLikeSecretKey(field.key)) {
        if (execution.inputValues?.[field.key] !== undefined) skippedSecrets = true;
        continue;
      }
      const value = execution.inputValues?.[field.key];
      if (value !== undefined) prefill[field.key] = value;
    }
    setValues(prefill);
    setFormError(null);
    setRetryNote(
      skippedSecrets
        ? "Reaproveitei os campos dessa execução — só os de senha/token ficaram em branco, preenche de novo antes de rodar."
        : "Reaproveitei os campos dessa execução — confira antes de rodar."
    );
  }

  function handleRunClick() {
    if (missingRequired.length > 0) {
      setFormError(`Preencha: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    setFormError(null);
    setShowConfirm(true);
  }

  // Runs one leg of an SSE stream (either the initial run, or a continue
  // call for a heavy skill that didn't finish in one chunk) and reports
  // back whether it's actually done or needs another leg.
  async function streamLeg(url: string): Promise<{ execution: ExecutionItem; done: boolean }> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: url.includes("/continue") ? undefined : JSON.stringify({ inputValues: values, dryRun }),
    });

    if (!res.body) {
      throw new Error(`Falha ao rodar (HTTP ${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let execution: ExecutionItem | null = null;
    let legDone = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const eventMatch = rawEvent.match(/^event: (.+)$/m);
        const dataMatch = rawEvent.match(/^data: (.+)$/m);
        if (!eventMatch || !dataMatch) continue;

        const data = JSON.parse(dataMatch[1]);
        if (eventMatch[1] === "delta") {
          setThinkingText((prev) => prev + data.text);
        } else if (eventMatch[1] === "done") {
          execution = data as ExecutionItem;
          legDone = true;
        } else if (eventMatch[1] === "continue") {
          execution = data as ExecutionItem;
          legDone = false;
        } else if (eventMatch[1] === "error") {
          throw new Error(data.message ?? "Falha ao rodar a skill");
        }
      }
    }

    if (!execution) {
      // The stream ended without ever sending a proper "done"/"continue"/
      // "error" event — normally impossible (the route's own try/catch
      // always sends one before closing), so this means something killed
      // the connection from outside our code entirely (most likely the
      // platform's own hard timeout). Whatever text is sitting unparsed in
      // the buffer at that point is the only clue to what actually
      // happened — surface it instead of a dead-end generic message.
      const leftover = buffer.trim();
      throw new Error(
        `Falha ao rodar (HTTP ${res.status})` + (leftover ? `: ${leftover.slice(0, 500)}` : "")
      );
    }
    return { execution, done: legDone };
  }

  async function confirmAndRun() {
    setRunning(true);
    setRunError(null);
    setThinkingText("");
    setChunkNumber(1);
    try {
      let { execution, done } = await streamLeg(`/api/skills/${skill.id}/run/stream`);
      // A heavy skill that hits its per-chunk time budget comes back
      // "running" with more work queued up — keep calling continue until
      // it actually finishes, appending to the same live "Pensando..." text.
      while (!done) {
        setChunkNumber((n) => n + 1);
        ({ execution, done } = await streamLeg(`/api/executions/${execution.id}/continue`));
      }

      setExecutions((prev) => [execution, ...prev]);
      setShowConfirm(false);
      // A Cowork run comes back "running" here, not finished — the request
      // only queued it (setting up the job for the Mac mini agent to pick
      // up), it never waits for a real Cowork result. Say so instead of
      // letting the closed modal imply the run already finished.
      setRetryNote(
        skill.usesCowork && execution.status === "running"
          ? "Despachado pro agente do Mac mini — acompanhe o andamento no histórico abaixo (pode levar alguns minutos, dependendo da tarefa)."
          : null
      );
      setHighlightId(execution.id);
      setTimeout(() => setHighlightId(null), 1800);
      router.refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Falha ao rodar a skill");
    } finally {
      setRunning(false);
    }
  }

  const promptPreview = buildPromptSnapshot(skill.promptTemplate, values, schema);

  const stats = useMemo(() => {
    const finished = executions.filter((e) => e.status !== "pending" && e.status !== "running");
    const successCount = finished.filter((e) => e.status === "success").length;
    const totalCost = executions.reduce(
      (sum, e) => sum + (e.usage ? estimateCostUsd(e.usage) : 0),
      0
    );
    const durations = finished
      .map((e) => executionDurationMs(e.startedAt, e.finishedAt))
      .filter((ms): ms is number => ms !== null);
    const avgDurationMs =
      durations.length > 0 ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null;
    return {
      total: executions.length,
      successRate: finished.length > 0 ? Math.round((successCount / finished.length) * 100) : null,
      totalCost,
      avgDurationMs,
    };
  }, [executions]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
          <Play size={15} className="text-primary" />
          Rodar essa skill
        </h2>
        <DynamicForm schema={schema} values={values} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
        {retryNote && <p className="mt-2 text-sm text-primary">{retryNote}</p>}
        {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
        {skill.hasOutputCallback && (
          <label className="mt-3 flex items-start gap-2 text-sm text-ink/70 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Modo teste — roda a skill de verdade, mas não envia o retorno via API real (só mostra o
              que seria enviado).
            </span>
          </label>
        )}
        <button
          type="button"
          onClick={handleRunClick}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          <Play size={14} />
          {skill.confirmedOnce ? "Rodar" : "Revisar e rodar"}
        </button>
      </div>

      {showConfirm && (
        <ConfirmRunModal
          skillName={skill.name}
          source={skill.usesCowork ? "Claude Cowork" : "Claude"}
          usesCowork={skill.usesCowork}
          prompt={promptPreview}
          running={running}
          error={runError}
          thinking={thinkingText}
          showThinking={showThinking}
          chunkNumber={chunkNumber}
          onToggleThinking={() => setShowThinking((prev) => !prev)}
          onCancel={() => setShowConfirm(false)}
          onConfirm={confirmAndRun}
        />
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <History size={15} className="text-primary" />
            Histórico de execuções
          </h2>
          {stats.total > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>
                {stats.total} execuç{stats.total === 1 ? "ão" : "ões"}
              </span>
              {stats.successRate !== null && <span>{stats.successRate}% sucesso</span>}
              {stats.totalCost > 0 && (
                <span className="inline-flex items-center gap-1" title="Soma das estimativas de custo de todas as execuções">
                  <Coins size={11} />~{formatCostUsd(stats.totalCost)} ao todo
                </span>
              )}
              {stats.avgDurationMs !== null && (
                <span
                  className="inline-flex items-center gap-1"
                  title="Tempo médio das execuções já finalizadas — ajuda a notar se essa skill está ficando mais lenta"
                >
                  <Timer size={11} />~{formatDuration(stats.avgDurationMs)} em média
                </span>
              )}
            </div>
          )}
        </div>
        <ExecutionList
          executions={executions}
          highlightId={highlightId}
          onRetry={handleRetry}
          onFavoriteChange={(id, favorite) =>
            setExecutions((prev) => prev.map((e) => (e.id === id ? { ...e, favorite } : e)))
          }
          onCancel={(cancelled) =>
            setExecutions((prev) => prev.map((e) => (e.id === cancelled.id ? cancelled : e)))
          }
        />
      </div>
    </div>
  );
}

function ConfirmRunModal({
  skillName,
  source,
  usesCowork,
  prompt,
  running,
  error,
  thinking,
  showThinking,
  chunkNumber,
  onToggleThinking,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  source: string;
  usesCowork: boolean;
  prompt: string;
  running: boolean;
  error: string | null;
  thinking: string;
  showThinking: boolean;
  chunkNumber: number;
  onToggleThinking: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const statusLabel = usesCowork
    ? "Despachando pro Cowork…"
    : chunkNumber > 1
      ? `Continuando — etapa ${chunkNumber}`
      : thinking
        ? "Pensando…"
        : "Preparando…";

  return (
    <div
      className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-backdrop-in"
      onClick={running ? undefined : onCancel}
    >
      <div
        className="bg-surface rounded-2xl border border-line max-w-lg w-full shadow-2xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-primary to-primary-hover px-5 pt-5 pb-6 text-white overflow-hidden">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
          <div className="absolute -right-2 top-10 h-14 w-14 rounded-full bg-white/10" />
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            aria-label="Fechar"
            className="absolute right-3 top-3 text-white/70 hover:text-white rounded-md p-1 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              {usesCowork ? <Bot size={19} /> : <Sparkles size={19} />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/70 uppercase tracking-wide">
                {running ? "Rodando" : "Confirmar execução"}
              </p>
              <h3 className="font-semibold truncate">{skillName}</h3>
            </div>
          </div>
        </div>

        <div className="p-5">
          {!running && (
            <p className="text-sm text-muted mb-3">
              É exatamente isso que vai ser enviado pro {source}. Valores secretos aparecem
              mascarados abaixo, mas são usados por inteiro na execução real.
            </p>
          )}

          <div className="rounded-lg border border-line overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-ink/70">
              <FileText size={12} className="text-muted" />
              Prompt
            </div>
            <pre className="whitespace-pre-wrap break-words bg-surface p-3 text-xs max-h-48 overflow-y-auto text-ink/70">
              {prompt}
            </pre>
          </div>

          {running && (
            <div className="mt-3 rounded-lg border border-line overflow-hidden">
              <button
                type="button"
                onClick={onToggleThinking}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium bg-primary-soft/60 text-ink hover:bg-primary-soft transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  {statusLabel}
                </span>
                <ChevronDown
                  size={13}
                  className={`shrink-0 transition-transform ${showThinking ? "rotate-180" : ""}`}
                />
              </button>
              {showThinking && (
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs text-ink/70 bg-canvas/60 px-3 py-3">
                  {thinking ||
                    (usesCowork
                      ? "O Cowork ainda não expõe o passo a passo em tempo real — só o resultado final quando terminar."
                      : "Aguardando a primeira resposta…")}
                  {!usesCowork && <span className="inline-block w-1.5 h-3 bg-primary/60 ml-0.5 align-middle animate-pulse" />}
                </pre>
              )}
            </div>
          )}

          {running && chunkNumber > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(chunkNumber, 8) }).map((_, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
              <p className="text-xs text-muted">
                Tarefa longa — continuando automaticamente, sem precisar fechar essa janela.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={running}
              className="rounded-md px-3.5 py-2 text-sm border border-line hover:bg-canvas transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium shadow-sm shadow-primary/30 hover:bg-primary-hover hover:shadow-md hover:shadow-primary/30 disabled:opacity-60 disabled:shadow-none transition-all"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? "Rodando…" : "Confirmar e rodar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
