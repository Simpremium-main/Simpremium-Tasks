import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { listSkills } from "@/lib/data";

export const metadata: Metadata = {
  title: "Skills Hub",
  description: "Every Claude skill your boss sends you, kept in one place — ready to run.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const skills = await listSkills();
  const sidebarSkills = skills.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    needsInput: s.needsInput,
    usesCowork: s.usesCowork,
  }));

  return (
    <html lang="en">
      <body className="bg-canvas text-ink font-sans antialiased">
        <div className="flex h-screen overflow-hidden">
          <Sidebar skills={sidebarSkills} />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-12">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
