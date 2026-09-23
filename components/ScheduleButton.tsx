"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import ScheduleModal from "./ScheduleModal";
import { describeSchedule } from "@/lib/schedule";
import type { ApiFieldSource, InputField, SkillSchedule } from "@/lib/types";

export default function ScheduleButton({
  skillId,
  skillName,
  inputSchema,
  schedule,
  scheduleInputValues,
  scheduleApiSources,
  scheduleLastRunAt,
  hasUnschedulableSecret,
}: {
  skillId: string;
  skillName: string;
  inputSchema: InputField[];
  schedule: SkillSchedule | null;
  scheduleInputValues: Record<string, string> | null;
  scheduleApiSources: Record<string, ApiFieldSource> | null;
  scheduleLastRunAt: string | null;
  hasUnschedulableSecret: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Values/API sources can be configured (for the manual "Buscar dados da
  // API" button) without an active recurring schedule — the pill should
  // still say something other than "Agendar" in that case, since there IS
  // real config behind it, just not a cron trigger.
  const hasConfiguredValues =
    Boolean(scheduleInputValues && Object.keys(scheduleInputValues).length) ||
    Boolean(scheduleApiSources && Object.keys(scheduleApiSources).length);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          schedule
            ? `Agendamento: ${describeSchedule(schedule)}`
            : hasConfiguredValues
              ? "Valores/fontes de API configurados, sem agendamento automático ativo"
              : "Agendar essa skill"
        }
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          schedule || hasConfiguredValues
            ? "border-primary/30 bg-primary-soft text-primary"
            : "border-line text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft"
        }`}
      >
        <CalendarClock size={13} />
        {schedule ? "Agendada" : hasConfiguredValues ? "Configurada" : "Agendar"}
      </button>

      {open && (
        <ScheduleModal
          skillId={skillId}
          skillName={skillName}
          inputSchema={inputSchema}
          schedule={schedule}
          scheduleInputValues={scheduleInputValues}
          scheduleApiSources={scheduleApiSources}
          scheduleLastRunAt={scheduleLastRunAt}
          hasUnschedulableSecret={hasUnschedulableSecret}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
