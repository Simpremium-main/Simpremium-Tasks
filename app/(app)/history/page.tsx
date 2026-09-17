import { Coins, Download, History } from "lucide-react";
import { getTotalUsage, listExecutions } from "@/lib/data";
import { estimateCostUsd, formatCostUsd } from "@/lib/cost";
import HistoryBoard from "@/components/HistoryBoard";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [executions, { usage: totalUsage, executionsWithUsage }] = await Promise.all([
    listExecutions(),
    getTotalUsage(),
  ]);

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
        actions={
          <>
            {executionsWithUsage > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink/80"
                title={`Soma da estimativa de custo de ${executionsWithUsage} execuç${executionsWithUsage === 1 ? "ão" : "ões"} com uso de API registrado, desde sempre — não é a cobrança real da Anthropic`}
              >
                <Coins size={13} className="text-primary" />~
                {formatCostUsd(estimateCostUsd(totalUsage))} gasto no total
              </span>
            )}
            <a
              href="/api/executions/export"
              title="Baixar todo o histórico de execuções como CSV"
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3.5 py-2 text-sm font-medium text-ink/80 hover:border-primary/30 hover:text-primary hover:bg-primary-soft transition-colors"
            >
              <Download size={15} />
              Exportar
            </a>
          </>
        }
      />
      <HistoryBoard executions={items} />
    </div>
  );
}
