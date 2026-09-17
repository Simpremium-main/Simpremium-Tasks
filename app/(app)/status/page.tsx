import { Activity, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { checkSupabaseConnection } from "@/lib/data";
import { isClaudeConfigured } from "@/lib/claude";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type CheckState = "ok" | "warn" | "missing";

interface StatusCheck {
  label: string;
  state: CheckState;
  detail: string;
}

const STATE_STYLES: Record<CheckState, { icon: React.ReactNode; className: string }> = {
  ok: { icon: <CheckCircle2 size={16} />, className: "text-emerald-700 bg-emerald-50" },
  warn: { icon: <AlertTriangle size={16} />, className: "text-amber-700 bg-amber-50" },
  missing: { icon: <XCircle size={16} />, className: "text-red-700 bg-red-50" },
};

export default async function StatusPage() {
  const supabaseCheck = await checkSupabaseConnection();

  const checks: StatusCheck[] = [
    {
      label: "Banco de dados (Supabase)",
      state: supabaseCheck.ok ? "ok" : "missing",
      detail: supabaseCheck.ok
        ? "Conectado — leu a tabela de skills agora mesmo."
        : `Não conseguiu conectar: ${supabaseCheck.error ?? "erro desconhecido"}`,
    },
    {
      label: "Claude direto (ANTHROPIC_API_KEY)",
      state: isClaudeConfigured() ? "ok" : "missing",
      detail: isClaudeConfigured()
        ? "Configurada — skills que não usam Cowork rodam de verdade."
        : "Não configurada — skills que não usam Cowork ficam marcadas \"needs setup\" ao rodar.",
    },
    {
      label: "Claude Cowork (COWORK_DISPATCH_WEBHOOK_URL)",
      state: process.env.COWORK_DISPATCH_WEBHOOK_URL ? "ok" : "missing",
      detail: process.env.COWORK_DISPATCH_WEBHOOK_URL
        ? "Configurado — skills marcadas \"usa Cowork\" despacham de verdade."
        : "Não configurado — nenhuma skill marcada \"usa Cowork\" consegue rodar ainda.",
    },
    {
      label: "Proteção do agendamento (CRON_SECRET)",
      state: process.env.CRON_SECRET ? "ok" : "warn",
      detail: process.env.CRON_SECRET
        ? "Configurado — só a Vercel consegue disparar execuções agendadas."
        : "Não configurado — o endpoint de agendamento roda sem autenticação. Recomendado uma vez em produção.",
    },
    {
      label: "Alerta de falha agendada (SCHEDULE_FAILURE_WEBHOOK_URL)",
      state: process.env.SCHEDULE_FAILURE_WEBHOOK_URL ? "ok" : "warn",
      detail: process.env.SCHEDULE_FAILURE_WEBHOOK_URL
        ? "Configurado — você recebe um aviso quando uma execução agendada falha sozinha."
        : "Não configurado (opcional) — nada te avisa se uma execução agendada falhar sem você olhar.",
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<Activity size={18} />}
        title="Status do sistema"
        subtitle="O que está configurado, e o que ainda falta"
      />
      <div className="space-y-2.5 animate-stagger">
        {checks.map((check) => {
          const style = STATE_STYLES[check.state];
          return (
            <div
              key={check.label}
              className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.className}`}>
                {style.icon}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink text-sm">{check.label}</p>
                <p className="text-sm text-muted mt-0.5">{check.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-muted">
        Só confere se cada coisa está configurada (e, pro banco, se responde agora) — não mostra os
        valores reais de nenhuma chave ou token.
      </p>
    </div>
  );
}
