import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

const STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-50 text-emerald-700",
  success: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700",
  pending: "bg-slate-100 text-slate-600",
  running: "bg-sky-50 text-sky-700",
  needs_setup: "bg-amber-50 text-amber-700",
};

const ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle2 size={11} />,
  success: <CheckCircle2 size={11} />,
  error: <XCircle size={11} />,
  running: <Loader2 size={11} className="animate-spin" />,
  pending: <Clock size={11} />,
  needs_setup: <AlertTriangle size={11} />,
};

const LABELS: Record<string, string> = {
  needs_setup: "needs setup",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-slate-100 text-slate-600";
  const label = LABELS[status] ?? status;
  const icon = ICONS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${style}`}
    >
      {icon}
      {label}
    </span>
  );
}
