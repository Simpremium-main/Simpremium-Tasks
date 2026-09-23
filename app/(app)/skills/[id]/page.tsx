import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Bot, FileText, Folder, PenLine, Sparkles, Tag } from "lucide-react";
import { getSkillWithExecutions } from "@/lib/data";
import StatusBadge from "@/components/StatusBadge";
import RunSkillPanel from "@/components/RunSkillPanel";
import PageHeader from "@/components/PageHeader";
import DeleteSkillButton from "@/components/DeleteSkillButton";
import DuplicateSkillButton from "@/components/DuplicateSkillButton";
import ArchiveSkillButton from "@/components/ArchiveSkillButton";
import ScheduleButton from "@/components/ScheduleButton";
import ShareSkillButton from "@/components/ShareSkillButton";
import { isClaudeConfigured } from "@/lib/claude";
import { isCoworkAgentConfigured } from "@/lib/cowork";
import { hasUnschedulableSecret } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function SkillDetailPage({ params }: { params: { id: string } }) {
  const skill = await getSkillWithExecutions(params.id);

  if (!skill) notFound();

  const dispatchReady = skill.usesCowork ? isCoworkAgentConfigured() : isClaudeConfigured();

  const executions = skill.executions.map((e) => ({
    ...e,
    startedAt: e.startedAt.toISOString(),
    finishedAt: e.finishedAt?.toISOString() ?? null,
    coworkStartedAt: e.coworkStartedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      <PageHeader
        icon={skill.usesCowork ? <Bot size={18} /> : <Sparkles size={18} />}
        title={skill.name}
        actions={
          <>
            <StatusBadge status={skill.status} />
            <DuplicateSkillButton
              skillFields={{
                name: skill.name,
                description: skill.description,
                promptTemplate: skill.promptTemplate,
                needsInput: skill.needsInput,
                usesCowork: skill.usesCowork,
                inputSchema: skill.inputSchema ?? [],
                group: skill.group,
                tags: skill.tags,
              }}
              sourcePost={skill.sourcePost}
            />
            <ArchiveSkillButton skillId={skill.id} status={skill.status} confirmedOnce={skill.confirmedOnce} />
            <ScheduleButton
              skillId={skill.id}
              skillName={skill.name}
              inputSchema={skill.inputSchema ?? []}
              schedule={skill.schedule}
              scheduleInputValues={skill.scheduleInputValues}
              scheduleApiSources={skill.scheduleApiSources}
              scheduleLastRunAt={skill.scheduleLastRunAt?.toISOString() ?? null}
              hasUnschedulableSecret={hasUnschedulableSecret(skill.inputSchema ?? [])}
            />
            <ShareSkillButton skillId={skill.id} shareToken={skill.shareToken} />
            <Link
              href={`/skills/${skill.id}/edit`}
              title="Editar skill"
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
            >
              <PenLine size={13} />
              Editar
            </Link>
            <DeleteSkillButton skillId={skill.id} skillName={skill.name} />
          </>
        }
      />

      <div className="space-y-5 animate-fade-in">
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {skill.group && (
              <span className="inline-flex items-center gap-1 text-xs rounded-full bg-slate-100 text-ink/70 px-2.5 py-0.5">
                <Folder size={11} />
                {skill.group}
              </span>
            )}
            {skill.usesCowork && (
              <span className="inline-flex items-center gap-1 text-xs rounded-full bg-cowork-soft text-cowork px-2.5 py-0.5">
                <Bot size={11} />
                usa Cowork
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
          <p className="text-ink/70 whitespace-pre-wrap text-sm">{skill.description}</p>
        </div>

        {!dispatchReady && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 text-amber-800 text-sm p-4">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>
              {skill.usesCowork
                ? "Essa skill precisa de configuração manual: nenhum agente Cowork está " +
                  "configurado ainda (COWORK_AGENT_TOKEN — veja mac-agent/README.md). Se você " +
                  "rodar, ela vai registrar a tentativa marcada como \"needs setup\"."
                : "Essa skill precisa de configuração manual: ANTHROPIC_API_KEY não está " +
                  "configurada ainda. Se você rodar, ela vai registrar a tentativa marcada " +
                  "como \"needs setup\"."}
            </p>
          </div>
        )}

        <details className="group rounded-xl border border-line bg-surface p-5 text-sm">
          <summary className="cursor-pointer font-semibold text-ink flex items-center gap-2 list-none">
            <FileText size={15} className="text-primary" />
            Template do prompt
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-ink/70 bg-canvas rounded-md p-3">
            {skill.promptTemplate}
          </pre>
        </details>

        <RunSkillPanel
          skill={{
            id: skill.id,
            name: skill.name,
            promptTemplate: skill.promptTemplate,
            needsInput: skill.needsInput,
            usesCowork: skill.usesCowork,
            inputSchema: skill.inputSchema,
            confirmedOnce: skill.confirmedOnce,
          }}
          initialExecutions={executions}
        />
      </div>
    </div>
  );
}
