"use client";

import { useState } from "react";
import { AlertTriangle, Archive, ArchiveRestore, Loader2 } from "lucide-react";
import type { SkillStatus } from "@/lib/types";

export default function ArchiveSkillButton({
  skillId,
  status,
  confirmedOnce,
}: {
  skillId: string;
  status: SkillStatus;
  confirmedOnce: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = status === "archived";

  async function handleToggle() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Restoring lands on "active" when the skill already had a
        // successful run (confirmedOnce) before it was archived, "draft"
        // otherwise — same rule the app already uses everywhere else to
        // decide active vs. draft, so archiving never loses that state.
        body: JSON.stringify({ status: archived ? (confirmedOnce ? "active" : "draft") : "archived" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao ${archived ? "desarquivar" : "arquivar"} (HTTP ${res.status})`);
      }
      // Hard navigation — same reasoning as the other skill actions: the
      // sidebar list lives in the shared layout and won't drop/re-add this
      // skill on a plain client-side route change.
      window.location.href = archived ? `/skills/${skillId}` : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao mudar o arquivamento");
      setWorking(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={working}
        title={archived ? "Desarquivar skill" : "Arquivar skill"}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-60"
      >
        {working ? (
          <Loader2 size={13} className="animate-spin" />
        ) : archived ? (
          <ArchiveRestore size={13} />
        ) : (
          <Archive size={13} />
        )}
        {archived ? "Desarquivar" : "Arquivar"}
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
