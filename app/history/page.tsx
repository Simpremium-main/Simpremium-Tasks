import { listExecutions } from "@/lib/data";
import ExecutionList from "@/components/ExecutionList";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const executions = await listExecutions();

  const items = executions.map((e) => ({
    ...e,
    startedAt: e.startedAt.toISOString(),
    finishedAt: e.finishedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">All history</h1>
      <p className="text-sm text-ink/60 mb-6">
        Every run across every skill, most recent first — the place to find that report from last
        week.
      </p>
      <ExecutionList executions={items} showSkillName />
    </div>
  );
}
