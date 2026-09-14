import Link from "next/link";
import StatusBadge from "./StatusBadge";

interface SkillCardProps {
  id: string;
  name: string;
  description: string;
  status: string;
  needsInput: boolean;
  usesCowork: boolean;
  executionCount: number;
}

export default function SkillCard({
  id,
  name,
  description,
  status,
  needsInput,
  usesCowork,
  executionCount,
}: SkillCardProps) {
  return (
    <Link
      href={`/skills/${id}`}
      className="block rounded-lg border border-line bg-white p-4 hover:border-accent/50 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-ink">{name}</h3>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1.5 text-sm text-ink/60 line-clamp-2">{description || "No description yet."}</p>
      <div className="mt-3 flex items-center gap-3 text-xs text-ink/50">
        {needsInput && (
          <span className="inline-flex items-center gap-1" title="Needs input to run">
            📝 needs input
          </span>
        )}
        {usesCowork && (
          <span className="inline-flex items-center gap-1" title="Runs through Claude Cowork">
            🤝 Cowork
          </span>
        )}
        <span className="ml-auto">
          {executionCount} run{executionCount === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
