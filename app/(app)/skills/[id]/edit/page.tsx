import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import { getSkill } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import EditSkillForm from "@/components/EditSkillForm";

export const dynamic = "force-dynamic";

export default async function EditSkillPage({ params }: { params: { id: string } }) {
  const skill = await getSkill(params.id);
  if (!skill) notFound();

  return (
    <div>
      <PageHeader icon={<PenLine size={18} />} title={`Editar — ${skill.name}`} />
      <EditSkillForm
        skillId={skill.id}
        initialValue={{
          name: skill.name,
          description: skill.description,
          promptTemplate: skill.promptTemplate,
          needsInput: skill.needsInput,
          usesCowork: skill.usesCowork,
          inputSchema: skill.inputSchema ?? [],
          group: skill.group,
          tags: skill.tags,
          systemSecrets: skill.systemSecrets,
        }}
      />
    </div>
  );
}
