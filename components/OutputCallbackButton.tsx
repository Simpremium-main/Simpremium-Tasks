"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import OutputCallbackModal from "./OutputCallbackModal";
import type { OutputCallback } from "@/lib/types";

export default function OutputCallbackButton({
  skillId,
  skillName,
  outputCallback,
}: {
  skillId: string;
  skillName: string;
  outputCallback: OutputCallback | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={outputCallback ? `Retorno via API: ${outputCallback.url}` : "Enviar resultado via API ao terminar"}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          outputCallback
            ? "border-primary/30 bg-primary-soft text-primary"
            : "border-line text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft"
        }`}
      >
        <Send size={13} />
        {outputCallback ? "Retorno ativo" : "Retorno via API"}
      </button>

      {open && (
        <OutputCallbackModal
          skillId={skillId}
          skillName={skillName}
          outputCallback={outputCallback}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
