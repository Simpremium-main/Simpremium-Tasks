"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, Upload, X } from "lucide-react";

interface ImportResult {
  name: string;
  ok: boolean;
  id?: string;
  error?: string;
}

export default function ImportSkillsButton() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setItems(null);
    setParseError(null);
    setResults(null);
    setImporting(false);
  }

  function handleFile(file: File) {
    setParseError(null);
    setResults(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.skills) ? parsed.skills : null;
        if (!list) throw new Error("Esperava um array de skills, ou { skills: [...] }");
        setItems(list);
      } catch (err) {
        setItems(null);
        setParseError(err instanceof Error ? err.message : "JSON inválido");
      }
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!items) return;
    setImporting(true);
    try {
      const res = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: items }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao importar (HTTP ${res.status})`);
      setResults(body.results ?? []);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Falha ao importar");
    } finally {
      setImporting(false);
    }
  }

  const okCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Importar skills de um JSON exportado"
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3.5 py-2 text-sm font-medium text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
      >
        <Upload size={15} />
        Importar
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-backdrop-in"
            onClick={() => {
              setOpen(false);
              reset();
            }}
          >
          <div
            className="bg-surface rounded-2xl border border-line max-w-md w-full shadow-2xl animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-br from-primary to-primary-hover px-5 pt-5 pb-6 text-white overflow-hidden">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                aria-label="Fechar"
                className="absolute right-3 top-3 text-white/70 hover:text-white rounded-md p-1 hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
              <div className="relative flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                  <Upload size={19} />
                </span>
                <h3 className="font-semibold">Importar skills</h3>
              </div>
            </div>

            <div className="p-5">
              {results ? (
                <div>
                  <p className="text-sm text-ink/80 mb-3">
                    {okCount} de {results.length} skill{results.length === 1 ? "" : "s"} importada
                    {okCount === 1 ? "" : "s"} como rascunho — precisa testar cada uma antes de ativar.
                  </p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {results.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5 ${
                          r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {r.ok ? <CheckCircle2 size={13} className="shrink-0" /> : <AlertTriangle size={13} className="shrink-0" />}
                        <span className="truncate flex-1">{r.name}</span>
                        {!r.ok && <span className="shrink-0 text-[11px]">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => (window.location.href = "/")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
                  >
                    Ver skills
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted mb-3">
                    Escolhe o JSON exportado (ou qualquer JSON com a mesma forma). Toda skill entra
                    como rascunho, independente do status que tinha — precisa testar de novo aqui.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                    className="w-full text-sm"
                  />
                  {items && !parseError && (
                    <p className="mt-3 text-sm text-ink/80">
                      {items.length} skill{items.length === 1 ? "" : "s"} encontrada{items.length === 1 ? "" : "s"}
                      no arquivo.
                    </p>
                  )}
                  {parseError && (
                    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
                      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                      {parseError}
                    </div>
                  )}
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        reset();
                      }}
                      disabled={importing}
                      className="rounded-md px-3.5 py-2 text-sm border border-line hover:bg-canvas transition-colors disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmImport}
                      disabled={!items || importing}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                    >
                      {importing && <Loader2 size={14} className="animate-spin" />}
                      {importing ? "Importando…" : "Importar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
