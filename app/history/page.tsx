import { History } from "lucide-react";
import { listExecutions } from "@/lib/data";
import ExecutionList from "@/components/ExecutionList";
import PageHeader from "@/components/PageHeader";

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
      <PageHeader
        icon={<History size={18} />}
        title="Histórico completo"
        subtitle="Toda execução, de todas as skills — ache aquele relatório da semana passada"
      />
      <ExecutionList executions={items} showSkillName />
    </div>
  );
}
