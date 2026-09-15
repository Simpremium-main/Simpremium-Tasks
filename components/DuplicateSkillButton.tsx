"use client";

import { useState } from "react";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import type { EditableSkillFields } from "@/lib/types";

export default function DuplicateSkillButton({
  skillFields,
  sourcePost,
}: {
  skillFields: EditableSkillFields;
  sourcePost: string | null;
}) {
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDuplicate() {
    setDuplicating(true);
    setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...skillFields,
          name: `${skillFields.name} (cópia)`,
          sourcePost,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao duplicar (HTTP ${res.status})`);
      // Hard navigation — same reasoning as the other skill actions: the
      // sidebar lives in the shared layout and won't pick up the new skill
      // on a plain client-side route change.
      window.location.href = `/skills/${body.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao duplicar a skill");
      setDuplicating(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleDuplicate}
        disabled={duplicating}
        title="Duplicar skill"
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-60"
      >
        {duplicating ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
        Duplicar
      </button>
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle size={12} />
          {error}
        </span>
      )}
    </div>
  );
}
