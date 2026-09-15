"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import SkillFieldsEditor from "./SkillFieldsEditor";
import type { EditableSkillFields } from "@/lib/types";

export default function EditSkillForm({
  skillId,
  initialValue,
}: {
  skillId: string;
  initialValue: EditableSkillFields;
}) {
  const [value, setValue] = useState<EditableSkillFields>(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao salvar (HTTP ${res.status})`);
      }
      // Hard navigation — same reasoning as NewSkillForm/DeleteSkillButton:
      // the sidebar (group/name shown there) lives in the shared layout,
      // which a client-side route change doesn't re-fetch on its own.
      window.location.href = `/skills/${skillId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a skill");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-white p-5 space-y-5 animate-fade-in">
      <SkillFieldsEditor value={value} onChange={(patch) => setValue((v) => ({ ...v, ...patch }))} />

      <div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !value.name.trim() || !value.promptTemplate.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
          <a href={`/skills/${skillId}`} className="text-sm text-muted hover:text-ink transition-colors">
            Cancelar
          </a>
        </div>
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold">Não salvou.</strong> {error}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
