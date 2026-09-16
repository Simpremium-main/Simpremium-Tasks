"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, Loader2, PlayCircle, Trash2, X } from "lucide-react";
import DynamicForm from "./DynamicForm";
import { SCHEDULE_DAYS, describeSchedule } from "@/lib/schedule";
import type { InputField, SkillSchedule } from "@/lib/types";

export default function ScheduleModal({
  skillId,
  skillName,
  inputSchema,
  schedule,
  scheduleInputValues,
  scheduleLastRunAt,
  hasUnschedulableSecret,
  onClose,
}: {
  skillId: string;
  skillName: string;
  inputSchema: InputField[];
  schedule: SkillSchedule | null;
  scheduleInputValues: Record<string, string> | null;
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
  const missingRequired = schedulableSchema.filter((f) => f.required && !values[f.key]?.trim());

  async function save() {
    if (missingRequired.length > 0) {
      setError(`Preencha: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: { frequency, time, ...(frequency === "weekly" ? { dayOfWeek } : {}) },
          scheduleInputValues: Object.keys(values).length ? values : null,
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
      const res = await fetch(`/api/skills/${skillId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputValues: scheduleInputValues ?? {} }),
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
        className="bg-white rounded-2xl border border-line max-w-md w-full shadow-2xl animate-scale-in overflow-hidden"
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
                <div>
                  <p className="text-xs font-medium text-ink mb-2">
                    Valores padrão pra cada execução agendada
                  </p>
                  <DynamicForm
                    schema={schedulableSchema}
                    values={values}
                    onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
                  />
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
