import type { ReactNode } from "react";

const TONES = {
  primary: "bg-primary-soft text-primary",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  slate: "bg-slate-100 text-slate-600",
} as const;

export default function StatTile({
  icon,
  label,
  value,
  tone = "slate",
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-lg font-semibold text-ink leading-tight">{value}</div>
        <div className="text-xs text-muted truncate">{label}</div>
      </div>
    </div>
  );
}
