"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, Play, ShieldAlert } from "lucide-react";
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

  const missingRequired = schema.filter((f) => f.required && !values[f.key]?.trim());

  function handleRunClick() {
    if (missingRequired.length > 0) {
      setFormError(`Preencha: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    setFormError(null);
    setShowConfirm(true);
  }

  async function confirmAndRun() {
    setRunning(true);
    try {
      const res = await fetch(`/api/skills/${skill.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputValues: values }),
      });
      const execution = await res.json();
      setExecutions((prev) => [execution, ...prev]);
      setShowConfirm(false);
      router.refresh();
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
          prompt={promptPreview}
          running={running}
          onCancel={() => setShowConfirm(false)}
          onConfirm={confirmAndRun}
        />
      )}

      <div>
        <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
          <History size={15} className="text-primary" />
          Histórico de execuções
        </h2>
        <ExecutionList executions={executions} />
      </div>
    </div>
  );
}

function ConfirmRunModal({
  skillName,
  source,
  prompt,
  running,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  source: string;
  prompt: string;
  running: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-20 animate-backdrop-in">
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
