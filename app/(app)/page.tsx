import Link from "next/link";
import { Download, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { getCoworkAgentLastSeen, getCoworkQueueSummary, listActiveExecutions, listSkills } from "@/lib/data";
import { isClaudeConfigured } from "@/lib/claude";
import { isCoworkAgentConfigured } from "@/lib/cowork";
import { hasUnschedulableSecret } from "@/lib/schedule";
import SkillsBoard from "@/components/SkillsBoard";
import PageHeader from "@/components/PageHeader";
import ImportSkillsButton from "@/components/ImportSkillsButton";
import CoworkAgentStatus from "@/components/CoworkAgentStatus";
import CoworkQueueBadge from "@/components/CoworkQueueBadge";
import ActiveExecutionsStrip from "@/components/ActiveExecutionsStrip";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const skills = await listSkills();

  if (skills.length === 0) {
    return (
      <div>
        <PageHeader icon={<LayoutGrid size={18} />} title="Skills" />
        <div className="text-center py-24 animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Sparkles size={24} />
          </div>
          <h2 className="text-lg font-semibold">Nenhuma skill ainda</h2>
          <p className="mt-2 text-ink/60 max-w-sm mx-auto">
            Cole o próximo post sobre uma skill/MCP e transforme em algo pronto pra rodar quando
            quiser.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Link
              href="/skills/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <Plus size={15} />
              Nova skill
            </Link>
            <ImportSkillsButton />
          </div>
        </div>
      </div>
    );
  }

  const claudeReady = isClaudeConfigured();
  const coworkReady = isCoworkAgentConfigured();
  // Best-effort: this pill is a nice-to-have, not core to the skills list
  // rendering below it — e.g. the cowork_agent_status table not existing
  // yet (migration not run) shouldn't take down the whole dashboard.
  const coworkAgentLastSeen = coworkReady
    ? await getCoworkAgentLastSeen().catch((err) => {
        console.error("getCoworkAgentLastSeen failed:", err);
        return null;
      })
    : null;
  const coworkQueueSummary = coworkReady
    ? await getCoworkQueueSummary().catch((err) => {
        console.error("getCoworkQueueSummary failed:", err);
        return { waiting: 0, inProgress: 0, paused: false };
      })
    : { waiting: 0, inProgress: 0, paused: false };
  // Best-effort, same reasoning as the pills above — a hiccup here shouldn't
  // take down the skills list.
  const activeExecutions = await listActiveExecutions().catch((err) => {
    console.error("listActiveExecutions failed:", err);
    return [];
  });
  const archivedCount = skills.filter((s) => s.status === "archived").length;
  const boardSkills = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    status: s.status,
    needsInput: s.needsInput,
    usesCowork: s.usesCowork,
    executionCount: s._count.executions,
    needsSetup: s.usesCowork ? !coworkReady : !claudeReady,
    group: s.group,
    tags: s.tags,
    inputSchema: s.inputSchema ?? [],
    schedule: s.schedule,
    scheduleInputValues: s.scheduleInputValues,
    scheduleLastRunAt: s.scheduleLastRunAt?.toISOString() ?? null,
    hasUnschedulableSecret: hasUnschedulableSecret(s.inputSchema ?? []),
    pinned: s.pinned,
    position: s.position,
  }));

  return (
    <div>
      <PageHeader
        icon={<LayoutGrid size={18} />}
        title="Skills"
        subtitle={
          `${skills.length} skill${skills.length === 1 ? "" : "s"} centralizada${skills.length === 1 ? "" : "s"}` +
          (archivedCount > 0 ? ` (${archivedCount} arquivada${archivedCount === 1 ? "" : "s"})` : "")
        }
        actions={
          <>
            {coworkReady && (
              <>
                <CoworkAgentStatus initialLastSeenAt={coworkAgentLastSeen?.toISOString() ?? null} />
                <CoworkQueueBadge initialSummary={coworkQueueSummary} />
              </>
            )}
            <a
              href="/api/skills/export"
              title="Baixar todas as skills como JSON"
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3.5 py-2 text-sm font-medium text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
            >
              <Download size={15} />
              Exportar
            </a>
            <ImportSkillsButton />
            <Link
              href="/skills/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3.5 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <Plus size={15} />
              Nova skill
            </Link>
          </>
        }
      />
      <ActiveExecutionsStrip
        initialExecutions={activeExecutions.map((e) => ({
          id: e.id,
          status: e.status,
          source: e.source,
          coworkStartedAt: e.coworkStartedAt?.toISOString() ?? null,
          startedAt: e.startedAt.toISOString(),
          skill: e.skill,
        }))}
      />
      <SkillsBoard skills={boardSkills} />
    </div>
  );
}
