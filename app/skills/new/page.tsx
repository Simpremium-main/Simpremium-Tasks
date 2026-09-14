import NewSkillForm from "@/components/NewSkillForm";

export default function NewSkillPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">New skill</h1>
      <p className="text-sm text-ink/60 mb-6">
        Paste the post content — text, a screenshot's text, or a link's context — and review the
        draft before saving. Nothing runs until you confirm it from the skill's page.
      </p>
      <NewSkillForm />
    </div>
  );
}
