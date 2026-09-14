import { FilePlus2 } from "lucide-react";
import NewSkillForm from "@/components/NewSkillForm";
import PageHeader from "@/components/PageHeader";

export default function NewSkillPage() {
  return (
    <div>
      <PageHeader
        icon={<FilePlus2 size={18} />}
        title="Nova skill"
        subtitle="Cole o post e revise o rascunho antes de salvar"
      />
      <div className="animate-fade-in">
        <NewSkillForm />
      </div>
    </div>
  );
}
