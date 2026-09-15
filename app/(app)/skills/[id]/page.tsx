import { notFound } from "next/navigation";
import { AlertTriangle, Bot, FileText, Folder, Sparkles, Tag } from "lucide-react";
import { getSkillWithExecutions } from "@/lib/data";
import StatusBadge from "@/components/StatusBadge";
import RunSkillPanel from "@/components/RunSkillPanel";
import PageHeader from "@/components/PageHeader";
import DeleteSkillButton from "@/components/DeleteSkillButton";
import { isClaudeConfigured } from "@/lib/claude";

export const dynamic = "force-dynamic";

export default async function SkillDetailPage({ params }: { params: { id: string } }) {
  const skill = await getSkillWithExecutions(params.id);

  if (!skill) notFound();

  const dispatchReady = skill.usesCowork
    ? Boolean(process.env.COWORK_DISPATCH_WEBHOOK_URL)
    : isClaudeConfigured();

  const executions = skill.executions.map((e) => ({
    ...e,
    startedAt: e.startedAt.toISOString(),
    finishedAt: e.finishedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      <PageHeader
        icon={skill.usesCowork ? <Bot size={18} /> : <Sparkles size={18} />}
        title={skill.name}
        actions={
          <>
            <StatusBadge status={skill.status} />
            <DeleteSkillButton skillId={skill.id} skillName={skill.name} />
          </>
        }
      />

      <div className="space-y-5 animate-fade-in">
        <div className="rounded-xl border border-line bg-white p-5">
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
                ? "Essa skill precisa de configuração manual: nenhum dispatch pro Cowork está " +
                  "configurado ainda (COWORK_DISPATCH_WEBHOOK_URL). Se você rodar, ela vai " +
                  "registrar a tentativa marcada como \"needs setup\"."
                : "Essa skill precisa de configuração manual: ANTHROPIC_API_KEY não está " +
                  "configurada ainda. Se você rodar, ela vai registrar a tentativa marcada " +
                  "como \"needs setup\"."}
            </p>
          </div>
        )}

        <details className="group rounded-xl border border-line bg-white p-5 text-sm">
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
