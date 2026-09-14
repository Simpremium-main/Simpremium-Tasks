import type { ReactNode } from "react";

export default function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 sm:-mx-8 mb-6 border-b border-line bg-canvas/90 backdrop-blur px-4 sm:px-8 pt-6 pb-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-primary shrink-0">{icon}</span>
          <h1 className="text-base font-semibold text-ink truncate">{title}</h1>
          {subtitle && (
            <>
              <span className="text-muted hidden sm:inline">—</span>
              <span className="text-sm text-muted truncate hidden sm:inline">{subtitle}</span>
            </>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
