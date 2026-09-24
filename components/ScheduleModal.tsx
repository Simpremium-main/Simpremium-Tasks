"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, Check, Loader2, Plus, PlayCircle, Trash2, X } from "lucide-react";
import DynamicForm from "./DynamicForm";
import { SCHEDULE_DAYS, describeSchedule } from "@/lib/schedule";
import { describeApiFieldMapping } from "@/lib/apiFieldSource";
import type { ApiFieldMapping, ApiFieldSource, InputField, SkillSchedule } from "@/lib/types";

type SourceMode = "static" | "api";

// Draft state for one of a field's (possibly several) API sources — a
// field can be fed by more than one upstream API at once (two separate
// queues that both feed the same list), each resolved and joined with
// "\n" at run time (lib/schedule.ts's resolveScheduledInputValues).
interface SourceDraft {
  url: string;
  authHeader: string;
  // Only set once "Testar e gerar mapeamento" succeeds for this draft's
  // *current* url/header — cleared whenever either changes, so a stale
  // mapping can never be saved unverified against new values.
  mapping: ApiFieldMapping | undefined;
  preview: string;
  rawResponse: string;
  testing: boolean;
  rawLoading: boolean;
  fieldError: string;
}

function emptyDraft(): SourceDraft {
  return {
    url: "",
    authHeader: "",
    mapping: undefined,
    preview: "",
    rawResponse: "",
    testing: false,
    rawLoading: false,
    fieldError: "",
  };
}

function draftFromSource(source: ApiFieldSource): SourceDraft {
  return {
    url: source.url,
    authHeader: source.headers?.Authorization ?? "",
    mapping: source.mapping,
    preview: "",
    rawResponse: "",
    testing: false,
    rawLoading: false,
    fieldError: "",
  };
}

export default function ScheduleModal({
  skillId,
  skillName,
  inputSchema,
  schedule,
  scheduleInputValues,
  scheduleApiSources,
  scheduleLastRunAt,
  hasUnschedulableSecret,
  onClose,
}: {
  skillId: string;
  skillName: string;
  inputSchema: InputField[];
  schedule: SkillSchedule | null;
  scheduleInputValues: Record<string, string> | null;
  scheduleApiSources: Record<string, ApiFieldSource[]> | null;
  scheduleLastRunAt: string | null;
  hasUnschedulableSecret: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!schedule);
  // Whether to also turn on the recurring cron trigger, separate from just
  // configuring the values/API sources below — those work for a manual run
  // (RunSkillPanel's "Buscar dados da API") regardless of this. Defaults to
  // on only when a real schedule already exists; a fresh config starts off,
  // since opening this modal is now just as often "I want the manual button
  // to work" as it is "I want this to run itself".
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(Boolean(schedule));
  const [frequency, setFrequency] = useState<SkillSchedule["frequency"]>(schedule?.frequency ?? "daily");
  const [time, setTime] = useState(schedule?.time ?? "09:00");
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.dayOfWeek ?? 1);
  const [values, setValues] = useState<Record<string, string>>(scheduleInputValues ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const schedulableSchema = inputSchema.filter((f) => f.type !== "secret");

  // Per-field: a fixed saved value (existing behavior) or one-or-more
  // sources fetched fresh from an external API right before each scheduled
  // run (lib/apiFieldSource.ts). A field lives in exactly one of `values`
  // (static) or the drafts below — never both — enforced in save().
  const [sourceMode, setSourceMode] = useState<Record<string, SourceMode>>(() =>
    Object.fromEntries(
      schedulableSchema.map((f) => [f.key, (scheduleApiSources?.[f.key]?.length ?? 0) > 0 ? "api" : "static"])
    )
  );
  const [apiSourceDrafts, setApiSourceDrafts] = useState<Record<string, SourceDraft[]>>(() =>
    Object.fromEntries(schedulableSchema.map((f) => [f.key, (scheduleApiSources?.[f.key] ?? []).map(draftFromSource)]))
  );
  // The *combined* (already-joined, same as a real run would use) value per
  // field, from resolve-values — distinct from each draft's own `preview`
  // (that source's value alone, from testing it individually).
  const [apiPreview, setApiPreview] = useState<Record<string, string>>({});
  const [loadingSavedPreview, setLoadingSavedPreview] = useState(
    Boolean(scheduleApiSources && Object.keys(scheduleApiSources).length)
  );

  // Shows what's already configured the moment the modal opens, instead of
  // making "Testar e gerar mapeamento" (which re-calls Claude) the only way
  // to see it again — re-resolves every saved API field with its *existing*
  // mapping(s) (no AI involved, same resolveScheduledInputValues the cron
  // route and "Testar agora" use), so this is free to call on every open.
  useEffect(() => {
    if (!scheduleApiSources || Object.keys(scheduleApiSources).length === 0) {
      setLoadingSavedPreview(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/skills/${skillId}/schedule/resolve-values`, { method: "POST" })
      .then((res) => res.json().catch(() => ({})).then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok && body.values) {
          setApiPreview((prev) => ({ ...prev, ...body.values }));
        } else if (!ok) {
          const message = body.error ?? "Falha ao atualizar prévia";
          setApiSourceDrafts((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(scheduleApiSources)) {
              next[key] = (next[key] ?? []).map((d) => ({ ...d, fieldError: message }));
            }
            return next;
          });
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

  function updateDraft(fieldKey: string, index: number, patch: Partial<SourceDraft>) {
    setApiSourceDrafts((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] ?? []).map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  }

  function addSourceDraft(fieldKey: string) {
    setApiSourceDrafts((prev) => ({ ...prev, [fieldKey]: [...(prev[fieldKey] ?? []), emptyDraft()] }));
  }

  function removeSourceDraft(fieldKey: string, index: number) {
    setApiSourceDrafts((prev) => ({ ...prev, [fieldKey]: (prev[fieldKey] ?? []).filter((_, i) => i !== index) }));
  }

  function enableApiMode(field: InputField) {
    setSourceMode((p) => ({ ...p, [field.key]: "api" }));
    setApiSourceDrafts((prev) => (prev[field.key]?.length ? prev : { ...prev, [field.key]: [emptyDraft()] }));
  }

  // No AI, no mapping — just fetches the URL and shows exactly what comes
  // back, so a person can see the real field names/shape before deciding
  // how to map them (or sanity-check why a mapping isn't producing what
  // they expect).
  async function viewRawResponse(field: InputField, index: number) {
    const draft = apiSourceDrafts[field.key]?.[index];
    if (!draft) return;
    updateDraft(field.key, index, { rawLoading: true, fieldError: "" });
    try {
      const authValue = draft.authHeader.trim();
      const res = await fetch(`/api/skills/${skillId}/schedule/raw-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: field.key,
          url: draft.url.trim(),
          headers: authValue ? { Authorization: authValue } : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao buscar (HTTP ${res.status})`);
      updateDraft(field.key, index, { rawResponse: body.body, rawLoading: false });
    } catch (err) {
      updateDraft(field.key, index, {
        fieldError: err instanceof Error ? err.message : "Falha ao buscar resposta bruta",
        rawLoading: false,
      });
    }
  }

  async function testSource(field: InputField, index: number) {
    const draft = apiSourceDrafts[field.key]?.[index];
    if (!draft) return;
    updateDraft(field.key, index, { testing: true, fieldError: "" });
    try {
      const authValue = draft.authHeader.trim();
      const res = await fetch(`/api/skills/${skillId}/schedule/preview-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: field.key,
          url: draft.url.trim(),
          headers: authValue ? { Authorization: authValue } : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao testar (HTTP ${res.status})`);
      updateDraft(field.key, index, { mapping: body.mapping, preview: body.preview, testing: false });
    } catch (err) {
      updateDraft(field.key, index, {
        fieldError: err instanceof Error ? err.message : "Falha ao testar",
        testing: false,
      });
    }
  }

  const staticFields = schedulableSchema.filter((f) => sourceMode[f.key] !== "api");
  const apiFields = schedulableSchema.filter((f) => sourceMode[f.key] === "api");
  const missingRequired = staticFields.filter((f) => f.required && !values[f.key]?.trim());
  const untestedApiFields = apiFields.filter((f) => {
    const drafts = apiSourceDrafts[f.key] ?? [];
    return drafts.length === 0 || drafts.some((d) => !d.url.trim() || !d.mapping);
  });

  async function save() {
    if (missingRequired.length > 0) {
      setError(`Preencha: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    if (untestedApiFields.length > 0) {
      setError(`Teste todas as fontes de API pra: ${untestedApiFields.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const finalValues: Record<string, string> = {};
      for (const f of staticFields) if (values[f.key]) finalValues[f.key] = values[f.key];

      const finalApiSources: Record<string, ApiFieldSource[]> = {};
      for (const f of apiFields) {
        const drafts = apiSourceDrafts[f.key] ?? [];
        finalApiSources[f.key] = drafts.map((d) => ({
          url: d.url.trim(),
          headers: d.authHeader.trim() ? { Authorization: d.authHeader.trim() } : null,
          mapping: d.mapping!,
        }));
      }

      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: autoScheduleEnabled
            ? { frequency, time, ...(frequency === "weekly" ? { dayOfWeek } : {}) }
            : null,
          scheduleInputValues: Object.keys(finalValues).length ? finalValues : null,
          scheduleApiSources: Object.keys(finalApiSources).length ? finalApiSources : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao salvar (HTTP ${res.status})`);
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o agendamento");
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
        body: JSON.stringify({ schedule: null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao remover (HTTP ${res.status})`);
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover o agendamento");
      setSaving(false);
    }
  }

  async function testNow() {
    setTesting(true);
    setError(null);
    try {
      // Resolves API-sourced fields fresh first (same helper the real
      // cron-driven run uses — lib/schedule.ts's resolveScheduledInputValues)
      // so this genuinely exercises what a scheduled run would send, not
      // just the saved static values.
      const resolveRes = await fetch(`/api/skills/${skillId}/schedule/resolve-values`, { method: "POST" });
      const resolveBody = await resolveRes.json().catch(() => ({}));
      if (!resolveRes.ok) {
        throw new Error(resolveBody.error ?? `Falha ao resolver valores (HTTP ${resolveRes.status})`);
      }

      const res = await fetch(`/api/skills/${skillId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputValues: resolveBody.values ?? scheduleInputValues ?? {} }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao testar (HTTP ${res.status})`);
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar o agendamento");
      setTesting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-backdrop-in"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-surface rounded-2xl border border-line max-w-md w-full shadow-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col"
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
              <CalendarClock size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/70 uppercase tracking-wide">Agendamento</p>
              <h3 className="font-semibold truncate">{skillName}</h3>
            </div>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {hasUnschedulableSecret ? (
            <p className="text-sm text-muted">
              Essa skill tem um campo secreto obrigatório, então não dá pra agendar — não existe
              onde guardar esse valor com segurança pra uma execução sem ninguém supervisionando.
            </p>
          ) : schedule && !editing ? (
            <div>
              <p className="text-sm text-ink/80">Roda {describeSchedule(schedule)}.</p>
              <p className="mt-1 text-xs text-muted">
                {scheduleLastRunAt
                  ? `Última execução agendada: ${new Date(scheduleLastRunAt).toLocaleString("pt-BR")}`
                  : "Ainda não rodou pelo agendamento."}
              </p>
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
                  onClick={testNow}
                  disabled={testing}
                  title="Roda a skill agora, com os mesmos valores salvos pro agendamento — sem esperar o horário"
                  className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors disabled:opacity-50"
                >
                  {testing ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                  {testing ? "Testando…" : "Testar agora"}
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
                Os valores e fontes de API configurados aqui embaixo ficam disponíveis tanto pro agendamento
                automático (se ativar) quanto pro botão "Buscar dados da API" no painel de rodar manualmente —
                não precisa ativar o agendamento só pra isso funcionar.
              </p>

              <label className="flex items-start gap-2 text-sm text-ink cursor-pointer rounded-md border border-line p-2.5">
                <input
                  type="checkbox"
                  checked={autoScheduleEnabled}
                  onChange={(e) => setAutoScheduleEnabled(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="font-medium">Também rodar automaticamente</span>
                  <span className="block text-xs text-muted mt-0.5">
                    Além de deixar os valores prontos, roda essa skill sozinha num horário fixo.
                  </span>
                </span>
              </label>

              {autoScheduleEnabled && (
                <>
                  <p className="text-xs text-muted">
                    Horário em UTC (não é o seu fuso local) — o servidor que roda isso não sabe seu fuso.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1">Frequência</label>
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as SkillSchedule["frequency"])}
                        className="rounded-md border border-line px-2.5 py-1.5 text-sm"
                      >
                        <option value="daily">Diariamente</option>
                        <option value="weekly">Semanalmente</option>
                      </select>
                    </div>
                    {frequency === "weekly" && (
                      <div>
                        <label className="block text-xs font-medium text-ink mb-1">Dia da semana</label>
                        <select
                          value={dayOfWeek}
                          onChange={(e) => setDayOfWeek(Number(e.target.value))}
                          className="rounded-md border border-line px-2.5 py-1.5 text-sm"
                        >
                          {SCHEDULE_DAYS.map((day, i) => (
                            <option key={day} value={i}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1">Horário (UTC)</label>
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="rounded-md border border-line px-2.5 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              {schedulableSchema.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-ink">Valores pra cada execução agendada</p>
                  {schedulableSchema.map((field) => {
                    const drafts = apiSourceDrafts[field.key] ?? [];
                    return (
                      <div key={field.key} className="rounded-md border border-line p-2.5">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-medium text-ink/70">{field.label}</span>
                          <div className="flex items-center gap-1 rounded-md border border-line bg-canvas p-0.5">
                            <button
                              type="button"
                              onClick={() => setSourceMode((p) => ({ ...p, [field.key]: "static" }))}
                              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                sourceMode[field.key] !== "api"
                                  ? "bg-primary text-white"
                                  : "text-muted hover:bg-surface"
                              }`}
                            >
                              Valor fixo
                            </button>
                            <button
                              type="button"
                              onClick={() => enableApiMode(field)}
                              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                sourceMode[field.key] === "api"
                                  ? "bg-primary text-white"
                                  : "text-muted hover:bg-surface"
                              }`}
                            >
                              Buscar da API
                            </button>
                          </div>
                        </div>

                        {sourceMode[field.key] !== "api" ? (
                          <DynamicForm
                            schema={[field]}
                            values={values}
                            onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
                          />
                        ) : (
                          <div className="space-y-3">
                            {drafts.map((draft, index) => (
                              <div
                                key={index}
                                className={`space-y-2 ${index > 0 ? "border-t border-line pt-3" : ""}`}
                              >
                                {drafts.length > 1 && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-muted">Fonte {index + 1}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeSourceDraft(field.key, index)}
                                      title="Remover essa fonte"
                                      className="text-muted hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                                <input
                                  type="url"
                                  value={draft.url}
                                  onChange={(e) =>
                                    updateDraft(field.key, index, {
                                      url: e.target.value,
                                      mapping: undefined,
                                      preview: "",
                                      rawResponse: "",
                                    })
                                  }
                                  placeholder="https://sua-outra-api.com/endpoint"
                                  className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm"
                                />
                                <input
                                  type="text"
                                  value={draft.authHeader}
                                  onChange={(e) =>
                                    updateDraft(field.key, index, {
                                      authHeader: e.target.value,
                                      mapping: undefined,
                                      preview: "",
                                      rawResponse: "",
                                    })
                                  }
                                  placeholder="Header Authorization (opcional) — ex: Bearer abc123"
                                  className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm"
                                />
                                {draft.mapping && (
                                  <p className="text-xs text-ink/70 bg-canvas rounded-md px-2.5 py-1.5">
                                    {describeApiFieldMapping(draft.mapping)}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => testSource(field, index)}
                                    disabled={!draft.url.trim() || draft.testing}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {draft.testing ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : draft.mapping ? (
                                      <Check size={12} className="text-emerald-600" />
                                    ) : null}
                                    {draft.mapping ? "Gerar de novo" : "Testar e gerar mapeamento"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => viewRawResponse(field, index)}
                                    disabled={!draft.url.trim() || draft.rawLoading}
                                    title="Busca a URL e mostra a resposta exatamente como veio, sem mapear nada"
                                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {draft.rawLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                                    Ver resposta bruta (JSON)
                                  </button>
                                </div>
                                {draft.fieldError && <p className="text-xs text-red-600">{draft.fieldError}</p>}
                                {draft.rawResponse && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
                                      Resposta bruta da API (sem mapear)
                                    </p>
                                    <pre className="whitespace-pre-wrap break-words rounded-md bg-canvas p-2 text-xs text-ink/80 max-h-48 overflow-y-auto">
                                      {draft.rawResponse}
                                    </pre>
                                  </div>
                                )}
                                {draft.preview && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
                                      Prévia dessa fonte
                                    </p>
                                    <pre className="whitespace-pre-wrap break-words rounded-md bg-canvas p-2 text-xs text-ink/80 max-h-32 overflow-y-auto">
                                      {draft.preview}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => addSourceDraft(field.key)}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                            >
                              <Plus size={12} />
                              Adicionar outra fonte pra esse campo
                            </button>

                            {loadingSavedPreview && drafts.some((d) => d.mapping) && (
                              <p className="inline-flex items-center gap-1 text-xs text-muted">
                                <Loader2 size={11} className="animate-spin" />
                                atualizando prévia combinada…
                              </p>
                            )}
                            {apiPreview[field.key] && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
                                  Prévia do valor combinado agora{drafts.length > 1 ? " (todas as fontes juntas)" : ""}
                                </p>
                                <pre className="whitespace-pre-wrap break-words rounded-md bg-canvas p-2 text-xs text-ink/80 max-h-32 overflow-y-auto">
                                  {apiPreview[field.key]}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {inputSchema.some((f) => f.type === "secret") && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5">
                  Os campos de senha/token dessa skill são opcionais e ficam de fora das
                  execuções agendadas.
                </p>
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
                  {saving ? "Salvando…" : autoScheduleEnabled ? "Salvar agendamento" : "Salvar valores"}
                </button>
                <button
                  type="button"
                  onClick={() => (schedule ? setEditing(false) : onClose())}
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
