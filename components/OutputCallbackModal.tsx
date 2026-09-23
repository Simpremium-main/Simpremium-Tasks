"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Loader2, Send, Trash2, X } from "lucide-react";
import { describeOutputCallback } from "@/lib/outputCallback";
import type { OutputCallback } from "@/lib/types";

export default function OutputCallbackModal({
  skillId,
  skillName,
  outputCallback,
  onClose,
}: {
  skillId: string;
  skillName: string;
  outputCallback: OutputCallback | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!outputCallback);
  const [url, setUrl] = useState(outputCallback?.url ?? "");
  const [method, setMethod] = useState<OutputCallback["method"]>(outputCallback?.method ?? "POST");
  const [authHeader, setAuthHeader] = useState(outputCallback?.headers?.Authorization ?? "");
  const [apiDescription, setApiDescription] = useState("");
  const [mapping, setMapping] = useState<
    { itemFieldMap: OutputCallback["itemFieldMap"]; itemsPath: string } | null
  >(outputCallback ? { itemFieldMap: outputCallback.itemFieldMap, itemsPath: outputCallback.itemsPath } : null);
  const [previewBody, setPreviewBody] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  // True when the mapping (or the saved config's preview) had no real
  // execution to check against yet — expected/benign, not an error, see
  // .../output-callback/preview's noSample fallback.
  const [noSample, setNoSample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSavedPreview, setLoadingSavedPreview] = useState(Boolean(outputCallback));

  // Shows what's already sent the moment the modal opens, instead of
  // making "Testar e gerar mapeamento" (which re-calls Claude) the only
  // way to see it — applies the *existing* saved mapping to the skill's
  // most recent successful run, no AI involved, so this is free to call
  // on every open.
  useEffect(() => {
    if (!outputCallback) {
      setLoadingSavedPreview(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/skills/${skillId}/output-callback/current-preview`, { method: "POST" })
      .then((res) => res.json().catch(() => ({})).then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) {
          setPreviewBody(body.previewBody ? JSON.stringify(body.previewBody, null, 2) : "");
          setNoSample(Boolean(body.noSample));
        } else {
          setTestError(body.error ?? "Falha ao atualizar prévia");
        }
      })
      .catch(() => {
        // Best-effort — the saved config still shows, just without a fresh preview.
      })
      .finally(() => {
        if (!cancelled) setLoadingSavedPreview(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearMapping() {
    setMapping(null);
    setPreviewBody("");
    setNoSample(false);
  }

  async function testMapping() {
    setTesting(true);
    setTestError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}/output-callback/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiDescription }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao testar (HTTP ${res.status})`);
      setMapping({ itemFieldMap: body.itemFieldMap, itemsPath: body.itemsPath });
      setPreviewBody(body.previewBody ? JSON.stringify(body.previewBody, null, 2) : "");
      setNoSample(Boolean(body.noSample));
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Falha ao testar");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!url.trim()) {
      setError("URL é obrigatória");
      return;
    }
    if (!mapping) {
      setError("Teste e gere o mapeamento antes de salvar");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outputCallback: {
            url: url.trim(),
            method,
            headers: authHeader.trim() ? { Authorization: authHeader.trim() } : null,
            itemFieldMap: mapping.itemFieldMap,
            itemsPath: mapping.itemsPath,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao salvar (HTTP ${res.status})`);
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o retorno via API");
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputCallback: null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao remover (HTTP ${res.status})`);
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover o retorno via API");
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-backdrop-in"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-surface rounded-2xl border border-line max-w-lg w-full shadow-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-primary to-primary-hover px-5 pt-5 pb-6 text-white overflow-hidden shrink-0">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
            className="absolute right-3 top-3 text-white/70 hover:text-white rounded-md p-1 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Send size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/70 uppercase tracking-wide">Retorno via API</p>
              <h3 className="font-semibold truncate">{skillName}</h3>
            </div>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {outputCallback && !editing ? (
            <div>
              <p className="text-sm text-ink/80">
                Depois de cada execução com sucesso, envia os dados dessa skill pra{" "}
                <span className="font-mono text-xs break-all">{outputCallback.url}</span> ({outputCallback.method}).
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-ink/70">
                {describeOutputCallback(outputCallback).map((line, i) => (
                  <li key={i}>• {line}</li>
                ))}
              </ul>
              {loadingSavedPreview && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
                  <Loader2 size={11} className="animate-spin" />
                  carregando prévia…
                </p>
              )}
              {testError && !loadingSavedPreview && <p className="mt-2 text-xs text-red-600">{testError}</p>}
              {noSample && !loadingSavedPreview && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5">
                  Ainda sem execução com tabela pra conferir — o mapeamento foi um palpite a partir só da
                  descrição da API. Depois da primeira execução com sucesso, reabra aqui pra ver a prévia real.
                </p>
              )}
              {previewBody && !loadingSavedPreview && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
                    Prévia do corpo enviado (execução com sucesso mais recente)
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-canvas p-2 text-xs text-ink/80 max-h-40 overflow-y-auto">
                    {previewBody}
                  </pre>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-red-600 transition-colors disabled:opacity-50 ml-auto"
                >
                  <Trash2 size={13} />
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Depois de cada execução com sucesso dessa skill (manual, agendada ou via Cowork — não importa
                como ela rodou), envia os dados da tabela do resultado pra essa API.
              </p>

              <div className="flex gap-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as OutputCallback["method"])}
                  className="rounded-md border border-line px-2 py-1.5 text-sm"
                >
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://outro-sistema.com/api/endpoint"
                  className="flex-1 rounded-md border border-line px-2.5 py-1.5 text-sm"
                />
              </div>
              <input
                type="text"
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                placeholder="Header Authorization (opcional) — ex: Bearer abc123"
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm"
              />

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Descrição da API de destino (endpoint, campos esperados, exemplo de body — cole a documentação
                  como veio)
                </label>
                <textarea
                  value={apiDescription}
                  onChange={(e) => {
                    setApiDescription(e.target.value);
                    clearMapping();
                  }}
                  rows={5}
                  placeholder='Ex: Body (JSON): items array. Cada item: phone_number, iccid, protocol (opcional)...'
                  className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm font-mono"
                />
              </div>

              <button
                type="button"
                onClick={testMapping}
                disabled={!url.trim() || !apiDescription.trim() || testing}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : mapping ? (
                  <Check size={12} className="text-emerald-600" />
                ) : null}
                {mapping ? "Mapeamento pronto" : "Testar e gerar mapeamento"}
              </button>
              <p className="text-[11px] text-muted -mt-1.5">
                Usa a execução com sucesso mais recente dessa skill como amostra — nunca envia nada de verdade
                pra API de destino, só monta e mostra o corpo da requisição. Sem uma execução com tabela ainda,
                gera um palpite só a partir da descrição da API, marcado como não conferido.
              </p>

              {testError && <p className="text-xs text-red-600">{testError}</p>}

              {noSample && mapping && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5">
                  Essa skill ainda não tem uma execução com tabela — o mapeamento acima é um palpite a partir só
                  da descrição da API, não conferido contra um resultado real. Pode salvar assim mesmo; depois da
                  primeira execução com sucesso, reabra e clique em "Gerar de novo" pra confirmar que bate.
                </p>
              )}

              {previewBody && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
                    Prévia do corpo da requisição (a partir da execução mais recente)
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-canvas p-2 text-xs text-ink/80 max-h-40 overflow-y-auto">
                    {previewBody}
                  </pre>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3.5 py-1.5 text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => (outputCallback ? setEditing(false) : onClose())}
                  disabled={saving}
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
