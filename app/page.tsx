import Link from "next/link";
import { LayoutGrid, Plus, Sparkles } from "lucide-react";
import { listSkills } from "@/lib/data";
import SkillCard from "@/components/SkillCard";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const skills = await listSkills();

  if (skills.length === 0) {
    return (
      <div>
        <PageHeader icon={<LayoutGrid size={18} />} title="Skills" />
        <div className="text-center py-24 animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Sparkles size={24} />
          </div>
          <h2 className="text-lg font-semibold">Nenhuma skill ainda</h2>
          <p className="mt-2 text-ink/60 max-w-sm mx-auto">
            Cole o próximo post que seu chefe mandar e transforme em uma skill pronta pra rodar
            quando quiser.
          </p>
          <Link
            href="/skills/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <Plus size={15} />
            Nova skill
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={<LayoutGrid size={18} />}
        title="Skills"
        subtitle={`${skills.length} skill${skills.length === 1 ? "" : "s"} centralizada${skills.length === 1 ? "" : "s"}`}
        actions={
          <Link
            href="/skills/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3.5 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <Plus size={15} />
            Nova skill
          </Link>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
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
