const STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
  pending: "bg-slate-100 text-slate-700",
  running: "bg-sky-100 text-sky-800",
  needs_setup: "bg-amber-100 text-amber-800",
};

const LABELS: Record<string, string> = {
  needs_setup: "needs setup",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-slate-100 text-slate-700";
  const label = LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
