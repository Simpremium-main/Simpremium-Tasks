import { notFound } from "next/navigation";
import { getSkillWithExecutions } from "@/lib/data";
import StatusBadge from "@/components/StatusBadge";
import RunSkillPanel from "@/components/RunSkillPanel";
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
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">{skill.name}</h1>
          <StatusBadge status={skill.status} />
          {skill.usesCowork && (
            <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5">
              🤝 uses Cowork
            </span>
          )}
        </div>
        <p className="mt-2 text-ink/70 whitespace-pre-wrap">{skill.description}</p>
      </div>

      {!dispatchReady && (
        <div className="rounded-md bg-amber-50 text-amber-800 text-sm p-3">
          {skill.usesCowork
            ? "This skill needs manual setup: no Cowork dispatch is configured yet " +
              "(COWORK_DISPATCH_WEBHOOK_URL). It will still record an attempt, flagged as " +
              "\"needs setup\", if you run it."
            : "This skill needs manual setup: ANTHROPIC_API_KEY isn't configured yet. It will " +
              "still record an attempt, flagged as \"needs setup\", if you run it."}
        </div>
      )}

      <details className="rounded-lg border border-line bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium">Prompt template</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-ink/70">
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
  );
}
