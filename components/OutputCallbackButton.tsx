"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import OutputCallbacksModal from "./OutputCallbackModal";
import type { OutputCallback } from "@/lib/types";

export default function OutputCallbackButton({
  skillId,
  skillName,
  outputCallbacks,
}: {
  skillId: string;
  skillName: string;
  outputCallbacks: OutputCallback[] | null;
}) {
  const [open, setOpen] = useState(false);
  const count = outputCallbacks?.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          count > 0
            ? `Retorno via API: ${outputCallbacks!.map((c) => c.url).join(", ")}`
            : "Enviar resultado via API ao terminar"
        }
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          count > 0
            ? "border-primary/30 bg-primary-soft text-primary"
            : "border-line text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft"
        }`}
      >
        <Send size={13} />
        {count === 0 ? "Retorno via API" : count === 1 ? "Retorno ativo" : `${count} retornos ativos`}
      </button>

      {open && (
        <OutputCallbacksModal
          skillId={skillId}
          skillName={skillName}
          outputCallbacks={outputCallbacks}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
