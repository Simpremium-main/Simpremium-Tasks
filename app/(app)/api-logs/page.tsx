import { ScrollText } from "lucide-react";
import { listApiCallLogs } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import ApiLogsList from "@/components/ApiLogsList";

export const dynamic = "force-dynamic";

export default async function ApiLogsPage() {
  const logs = await listApiCallLogs();

  const items = logs.map((log) => ({
    ...log,
    createdAt: log.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        icon={<ScrollText size={18} />}
        title="Logs de API"
        subtitle="Toda requisição feita e recebida pelo painel — o que veio de verdade de cada API"
      />
      <ApiLogsList logs={items} />
    </div>
  );
}
