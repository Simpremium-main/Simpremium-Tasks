"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, History, Loader2, Play, ShieldAlert, Sparkles } from "lucide-react";
import DynamicForm from "./DynamicForm";
import ExecutionList, { type ExecutionItem } from "./ExecutionList";
import { buildPromptSnapshot } from "@/lib/mask";
import type { InputField } from "@/lib/types";

interface Skill {
  id: string;
  name: string;
  promptTemplate: string;
  needsInput: boolean;
  usesCowork: boolean;
  inputSchema: InputField[] | null;
  confirmedOnce: boolean;
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

  const [values, setValues] = useState<Record<string, string>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [executions, setExecutions] = useState(initialExecutions);
  const [formError, setFormError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState("");
  const [showThinking, setShowThinking] = useState(false);
  const [chunkNumber, setChunkNumber] = useState(1);

  const missingRequired = schema.filter((f) => f.required && !values[f.key]?.trim());

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
      body: url.includes("/continue") ? undefined : JSON.stringify({ inputValues: values }),
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
      throw new Error(`Falha ao rodar (HTTP ${res.status})`);
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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
          <Play size={15} className="text-primary" />
          Rodar essa skill
        </h2>
        <DynamicForm schema={schema} values={values} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
        {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
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
        <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
          <History size={15} className="text-primary" />
          Histórico de execuções
        </h2>
        <ExecutionList executions={executions} highlightId={highlightId} />
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
  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-backdrop-in">
      <div className="bg-white rounded-xl border border-line max-w-lg w-full p-5 shadow-xl animate-scale-in">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <ShieldAlert size={16} />
          </span>
          <div>
            <h3 className="font-semibold text-ink">Confirmar: rodar &ldquo;{skillName}&rdquo;?</h3>
            <p className="text-sm text-muted mt-0.5">
              É exatamente isso que vai ser enviado pro {source}. Valores secretos aparecem
              mascarados abaixo, mas são usados por inteiro na execução real.
            </p>
          </div>
        </div>
        <pre className="mt-3 whitespace-pre-wrap break-words bg-canvas rounded-md p-3 text-xs max-h-64 overflow-y-auto">
          {prompt}
        </pre>
        {running && (
          <div className="mt-3 rounded-md border border-line bg-canvas overflow-hidden">
            <button
              type="button"
              onClick={onToggleThinking}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-ink/70 hover:bg-line/40 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-primary animate-pulse" />
                {usesCowork
                  ? "Despachando pro Cowork…"
                  : chunkNumber > 1
                    ? `Continuando (etapa ${chunkNumber})…`
                    : thinking
                      ? "Pensando…"
                      : "Aguardando resposta…"}
              </span>
              <ChevronDown
                size={13}
                className={`shrink-0 transition-transform ${showThinking ? "rotate-180" : ""}`}
              />
            </button>
            {showThinking && (
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs text-ink/70 px-3 pb-3">
                {thinking ||
                  (usesCowork
                    ? "O Cowork ainda não expõe o passo a passo em tempo real — só o resultado final quando terminar."
                    : "")}
              </pre>
            )}
          </div>
        )}
        {running && chunkNumber > 1 && (
          <p className="mt-2 text-xs text-muted">
            Essa tarefa tá demorando mais que o normal — o painel continua automaticamente até
            terminar. Pode levar alguns minutos, não precisa fechar essa janela.
          </p>
        )}
        {error && (
          <p className="flex items-start gap-2 text-sm text-red-600 mt-3">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            className="rounded-md px-3 py-1.5 text-sm border border-line hover:bg-canvas transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3.5 py-1.5 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? "Rodando…" : "Confirmar e rodar"}
          </button>
        </div>
      </div>
    </div>
  );
}
