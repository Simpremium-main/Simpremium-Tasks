import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";
import { listSkills } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const skills = await listSkills();
  const user = await getCurrentUser();
  // Archived skills stay out of the sidebar's nav list — same "out of the
  // way, not gone" idea as their own tab on the dashboard; still reachable
  // by URL and still keep their full execution history.
  const sidebarSkills = skills
    .filter((s) => s.status !== "archived")
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      needsInput: s.needsInput,
      usesCowork: s.usesCowork,
      group: s.group,
    }));
  const archivedCount = skills.length - sidebarSkills.length;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        skills={sidebarSkills}
        archivedCount={archivedCount}
        userDisplayName={user?.displayName ?? null}
        userNickname={user?.nickname ?? null}
        isAdmin={user?.role === "admin"}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-12">{children}</div>
      </main>
      <CommandPalette
        skills={sidebarSkills.map((s) => ({
          id: s.id,
          name: s.name,
          group: s.group,
          usesCowork: s.usesCowork,
        }))}
      />
    </div>
  );
}
