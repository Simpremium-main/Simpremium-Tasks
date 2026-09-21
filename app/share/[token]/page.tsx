import { notFound } from "next/navigation";
import { Bot, Folder, Link2, Sparkles, Tag } from "lucide-react";
import { getSkillWithExecutionsByShareToken } from "@/lib/data";
import StatusBadge from "@/components/StatusBadge";
import ExecutionList from "@/components/ExecutionList";

export const dynamic = "force-dynamic";

/**
 * Public, no-login page for a skill someone chose to share (see
 * ShareSkillButton / lib/data.ts's enableSkillSharing). Deliberately not
 * the full skill page: no prompt template (that's the skill's internal
 * config, not the point of sharing results), no run button, no edit/delete
 * — a read-only window onto what the skill is and what it's produced.
 * middleware.ts excludes /share/ from the auth gate so this doesn't bounce
 * to /login.
 */
export default async function SharedSkillPage({ params }: { params: { token: string } }) {
  const skill = await getSkillWithExecutionsByShareToken(params.token);

  if (!skill) notFound();

  const executions = skill.executions.map((e) => ({
    ...e,
    startedAt: e.startedAt.toISOString(),
    finishedAt: e.finishedAt?.toISOString() ?? null,
    coworkStartedAt: e.coworkStartedAt?.toISOString() ?? null,
  }));

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-1.5 text-xs text-muted mb-4">
          <Link2 size={12} />
          Link de visualização — somente leitura
        </div>

        <div className="rounded-xl border border-line bg-surface p-5 mb-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  skill.usesCowork ? "bg-cowork-soft text-cowork" : "bg-primary-soft text-primary"
                }`}
              >
                {skill.usesCowork ? <Bot size={16} /> : <Sparkles size={16} />}
              </span>
              <h1 className="font-semibold text-ink text-lg truncate">{skill.name}</h1>
            </div>
            <StatusBadge status={skill.status} />
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-2">
            {skill.group && (
              <span className="inline-flex items-center gap-1 text-xs rounded-full bg-slate-100 text-ink/70 px-2.5 py-0.5">
                <Folder size={11} />
                {skill.group}
              </span>
            )}
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs rounded-full bg-primary-soft text-primary px-2.5 py-0.5"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>

          <p className="text-ink/70 whitespace-pre-wrap text-sm">
            {skill.description || "Sem descrição ainda."}
          </p>
        </div>

        <h2 className="text-sm font-semibold text-ink mb-2">Histórico de execuções</h2>
        <ExecutionList executions={executions} favoritable={false} />

        <p className="mt-8 text-center text-xs text-muted">Skills Hub</p>
      </div>
    </div>
  );
}
