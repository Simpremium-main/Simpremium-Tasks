import Link from "next/link";
import { prisma } from "@/lib/db";
import SkillCard from "@/components/SkillCard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const skills = await prisma.skill.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { executions: true } } },
  });

  if (skills.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-semibold">No skills yet</h1>
        <p className="mt-2 text-ink/60">
          Paste the next post your boss sends you and turn it into a skill you can run any time.
        </p>
        <Link
          href="/skills/new"
          className="mt-4 inline-block rounded-md bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          + New skill
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Skills</h1>
        <span className="text-sm text-ink/50">
          {skills.length} skill{skills.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            id={skill.id}
            name={skill.name}
            description={skill.description}
            status={skill.status}
            needsInput={skill.needsInput}
            usesCowork={skill.usesCowork}
            executionCount={skill._count.executions}
          />
        ))}
      </div>
    </div>
  );
}
