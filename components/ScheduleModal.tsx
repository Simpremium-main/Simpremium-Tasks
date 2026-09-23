"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, Check, Loader2, PlayCircle, Trash2, X } from "lucide-react";
import DynamicForm from "./DynamicForm";
import { SCHEDULE_DAYS, describeSchedule } from "@/lib/schedule";
import { describeApiFieldMapping } from "@/lib/apiFieldSource";
import type { ApiFieldMapping, ApiFieldSource, InputField, SkillSchedule } from "@/lib/types";

type SourceMode = "static" | "api";

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
  scheduleApiSources: Record<string, ApiFieldSource> | null;
  scheduleLastRunAt: string | null;
  hasUnschedulableSecret: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!schedule);
  const [frequency, setFrequency] = useState<SkillSchedule["frequency"]>(schedule?.frequency ?? "daily");
  const [time, setTime] = useState(schedule?.time ?? "09:00");
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.dayOfWeek ?? 1);
  const [values, setValues] = useState<Record<string, string>>(scheduleInputValues ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const schedulableSchema = inputSchema.filter((f) => f.type !== "secret");

  // Per-field: a fixed saved value (existing behavior) or fetched fresh
  // from an external API right before each scheduled run (lib/apiFieldSource.ts).
  // A field lives in exactly one of `values` (static) or the api* state
  // below — never both — enforced in save() below.
  const [sourceMode, setSourceMode] = useState<Record<string, SourceMode>>(() =>
    Object.fromEntries(schedulableSchema.map((f) => [f.key, scheduleApiSources?.[f.key] ? "api" : "static"]))
  );
  const [apiUrl, setApiUrl] = useState<Record<string, string>>(() =>
    Object.fromEntries(schedulableSchema.map((f) => [f.key, scheduleApiSources?.[f.key]?.url ?? ""]))
  );
  const [apiAuthHeader, setApiAuthHeader] = useState<Record<string, string>>(() =>
    Object.fromEntries(schedulableSchema.map((f) => [f.key, scheduleApiSources?.[f.key]?.headers?.Authorization ?? ""]))
  );
  // Only set once "Testar e gerar mapeamento" succeeds for the field's
  // *current* url/header — cleared again whenever either changes, so a
  // stale mapping can never be saved unverified against new values.
  const [apiMapping, setApiMapping] = useState<Record<string, ApiFieldMapping | undefined>>(() =>
    Object.fromEntries(schedulableSchema.map((f) => [f.key, scheduleApiSources?.[f.key]?.mapping]))
  );
  const [apiPreview, setApiPreview] = useState<Record<string, string>>({});
  const [apiTesting, setApiTesting] = useState<Record<string, boolean>>({});
  const [apiFieldError, setApiFieldError] = useState<Record<string, string>>({});
  const [loadingSavedPreview, setLoadingSavedPreview] = useState(Boolean(scheduleApiSources));

  // Shows what's already configured the moment the modal opens, instead of
  // making "Testar e gerar mapeamento" (which re-calls Claude) the only way
  // to see it again — re-resolves every saved API field with its *existing*
  // mapping (no AI involved, same resolveScheduledInputValues the cron
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
          setApiFieldError((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(scheduleApiSources)) next[key] = body.error ?? "Falha ao atualizar prévia";
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

  function setApiUrlField(key: string, url: string) {
    setApiUrl((p) => ({ ...p, [key]: url }));
    setApiMapping((p) => ({ ...p, [key]: undefined }));
    setApiPreview((p) => ({ ...p, [key]: "" }));
  }

  function setApiAuthField(key: string, header: string) {
    setApiAuthHeader((p) => ({ ...p, [key]: header }));
    setApiMapping((p) => ({ ...p, [key]: undefined }));
    setApiPreview((p) => ({ ...p, [key]: "" }));
  }

  async function testApiField(field: InputField) {
    setApiTesting((p) => ({ ...p, [field.key]: true }));
    setApiFieldError((p) => ({ ...p, [field.key]: "" }));
    try {
      const authValue = apiAuthHeader[field.key]?.trim();
      const res = await fetch(`/api/skills/${skillId}/schedule/preview-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: field.key,
          url: apiUrl[field.key]?.trim() ?? "",
          headers: authValue ? { Authorization: authValue } : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha ao testar (HTTP ${res.status})`);
      setApiMapping((p) => ({ ...p, [field.key]: body.mapping }));
      setApiPreview((p) => ({ ...p, [field.key]: body.preview }));
    } catch (err) {
      setApiFieldError((p) => ({ ...p, [field.key]: err instanceof Error ? err.message : "Falha ao testar" }));
    } finally {
      setApiTesting((p) => ({ ...p, [field.key]: false }));
    }
  }

  const staticFields = schedulableSchema.filter((f) => sourceMode[f.key] !== "api");
  const apiFields = schedulableSchema.filter((f) => sourceMode[f.key] === "api");
  const missingRequired = staticFields.filter((f) => f.required && !values[f.key]?.trim());
  const untestedApiFields = apiFields.filter((f) => !apiUrl[f.key]?.trim() || !apiMapping[f.key]);

  async function save() {
    if (missingRequired.length > 0) {
      setError(`Preencha: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    if (untestedApiFields.length > 0) {
      setError(`Teste a origem da API pra: ${untestedApiFields.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const finalValues: Record<string, string> = {};
      for (const f of staticFields) if (values[f.key]) finalValues[f.key] = values[f.key];

      const finalApiSources: Record<string, ApiFieldSource> = {};
      for (const f of apiFields) {
        const authValue = apiAuthHeader[f.key]?.trim();
        finalApiSources[f.key] = {
          url: apiUrl[f.key].trim(),
          headers: authValue ? { Authorization: authValue } : null,
          mapping: apiMapping[f.key]!,
        };
      }

      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: { frequency, time, ...(frequency === "weekly" ? { dayOfWeek } : {}) },
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
      // just the static saved values.
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
        className="bg-surface rounded-2xl border border-line max-w-md w-full shadow-2xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-primary to-primary-hover px-5 pt-5 pb-6 text-white overflow-hidden">
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

        <div className="p-5">
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
                Horário em UTC (não é o seu fuso local) — o servidor que roda isso não sabe seu
                fuso.
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

              {schedulableSchema.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-ink">Valores pra cada execução agendada</p>
                  {schedulableSchema.map((field) => (
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
                            onClick={() => setSourceMode((p) => ({ ...p, [field.key]: "api" }))}
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
                        <div className="space-y-2">
                          <input
                            type="url"
                            value={apiUrl[field.key] ?? ""}
                            onChange={(e) => setApiUrlField(field.key, e.target.value)}
                            placeholder="https://sua-outra-api.com/endpoint"
                            className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm"
                          />
                          <input
                            type="text"
                            value={apiAuthHeader[field.key] ?? ""}
                            onChange={(e) => setApiAuthField(field.key, e.target.value)}
                            placeholder="Header Authorization (opcional) — ex: Bearer abc123"
                            className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm"
                          />
                          {apiMapping[field.key] && (
                            <p className="text-xs text-ink/70 bg-canvas rounded-md px-2.5 py-1.5">
                              {describeApiFieldMapping(apiMapping[field.key]!)}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => testApiField(field)}
                              disabled={!apiUrl[field.key]?.trim() || apiTesting[field.key]}
                              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {apiTesting[field.key] ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : apiMapping[field.key] ? (
                                <Check size={12} className="text-emerald-600" />
                              ) : null}
                              {apiMapping[field.key] ? "Gerar de novo" : "Testar e gerar mapeamento"}
                            </button>
                            {loadingSavedPreview && apiMapping[field.key] && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted">
                                <Loader2 size={11} className="animate-spin" />
                                atualizando prévia…
                              </span>
                            )}
                          </div>
                          {apiFieldError[field.key] && (
                            <p className="text-xs text-red-600">{apiFieldError[field.key]}</p>
                          )}
                          {apiPreview[field.key] && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
                                Prévia do valor agora
                              </p>
                              <pre className="whitespace-pre-wrap break-words rounded-md bg-canvas p-2 text-xs text-ink/80 max-h-32 overflow-y-auto">
                                {apiPreview[field.key]}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
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
                  {saving ? "Salvando…" : "Salvar agendamento"}
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
