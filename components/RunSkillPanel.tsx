"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      setFormError(`Fill in: ${missingRequired.map((f) => f.label).join(", ")}`);
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
      <div className="rounded-lg border border-line bg-white p-4">
        <h2 className="font-medium mb-3">Run this skill</h2>
        <DynamicForm schema={schema} values={values} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
        {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
        <button
          type="button"
          onClick={handleRunClick}
          className="mt-4 rounded-md bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          {skill.confirmedOnce ? "Run" : "Review & run"}
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
        <h2 className="font-medium mb-3">Execution history</h2>
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
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-20">
      <div className="bg-white rounded-lg border border-line max-w-lg w-full p-5 shadow-lg">
        <h3 className="font-medium">Confirm: run &ldquo;{skillName}&rdquo;?</h3>
        <p className="text-sm text-ink/60 mt-1">
          This is exactly what will be sent to {source}. Secret values are masked below but
          used in full when it actually runs.
        </p>
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
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={running}
            className="rounded-md bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent/90 disabled:opacity-60 transition-colors"
          >
            {running ? "Running…" : "Confirm & run"}
          </button>
        </div>
      </div>
    </div>
  );
}
