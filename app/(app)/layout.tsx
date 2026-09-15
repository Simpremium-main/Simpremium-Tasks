import Sidebar from "@/components/Sidebar";
import { listSkills } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const skills = await listSkills();
  const user = await getCurrentUser();
  const sidebarSkills = skills.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    needsInput: s.needsInput,
    usesCowork: s.usesCowork,
    group: s.group,
  }));

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar skills={sidebarSkills} userName={user?.email ?? null} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-12">{children}</div>
      </main>
    </div>
  );
}
