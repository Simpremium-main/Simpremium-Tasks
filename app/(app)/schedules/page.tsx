import Link from "next/link";
import { AlertTriangle, Bot, CalendarClock, Sparkles } from "lucide-react";
import { listScheduledSkillsOverview } from "@/lib/data";
import { describeSchedule, nextDueAt } from "@/lib/schedule";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const skills = await listScheduledSkillsOverview();
  const now = new Date();

  return (
    <div>
      <PageHeader
        icon={<CalendarClock size={18} />}
        title="Agendamentos"
        subtitle={`${skills.length} skill${skills.length === 1 ? "" : "s"} agendada${skills.length === 1 ? "" : "s"}`}
      />

      {skills.length === 0 ? (
        <div className="text-center py-24 animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <CalendarClock size={24} />
          </div>
          <h2 className="text-lg font-semibold">Nenhuma skill agendada ainda</h2>
          <p className="mt-2 text-ink/60 max-w-sm mx-auto">
            Abre a página de uma skill e configura um agendamento na seção "Agendamento" pra ela
            rodar sozinha.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            Ver skills
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5 animate-stagger">
          {skills.map((skill) => {
            const failed =
              skill.lastScheduledRun &&
              (skill.lastScheduledRun.status === "error" || skill.lastScheduledRun.status === "needs_setup");
            return (
              <div
                key={skill.id}
                className={`rounded-xl border bg-surface p-4 ${failed ? "border-red-200 bg-red-50/40" : "border-line"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={skill.usesCowork ? "text-cowork" : "text-primary"}>
                        {skill.usesCowork ? <Bot size={15} /> : <Sparkles size={15} />}
                      </span>
                      <Link
                        href={`/skills/${skill.id}`}
                        className="font-medium text-ink hover:text-primary transition-colors truncate"
                      >
                        {skill.name}
                      </Link>
                      {failed && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                          <AlertTriangle size={11} />
                          última execução agendada falhou
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink/60">
                      Roda {describeSchedule(skill.schedule!)} — próxima por volta de{" "}
                      {nextDueAt(skill.schedule!, now).toLocaleString("pt-BR", {
                        timeZone: "UTC",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}{" "}
                      UTC
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                    {skill.lastScheduledRun ? (
                      <>
                        <StatusBadge status={skill.lastScheduledRun.status} />
                        <span className="text-xs text-muted">
                          {new Date(skill.lastScheduledRun.startedAt).toLocaleString("pt-BR")}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted">Ainda não rodou pelo agendamento</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
