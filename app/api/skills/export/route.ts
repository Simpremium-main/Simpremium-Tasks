import { NextResponse } from "next/server";
import { listSkills } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * A skill-definitions backup, not a full data export — no execution history,
 * no secret values (none are ever stored to begin with, see lib/mask.ts),
 * just enough to recreate every skill elsewhere or restore one you deleted
 * by hand. GET, not POST: this only reads.
 */
export async function GET() {
  try {
    const skills = await listSkills();
    const payload = skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      status: skill.status,
      needsInput: skill.needsInput,
      usesCowork: skill.usesCowork,
      promptTemplate: skill.promptTemplate,
      inputSchema: skill.inputSchema,
      sourcePost: skill.sourcePost,
      group: skill.group,
      tags: skill.tags,
      schedule: skill.schedule,
      scheduleInputValues: skill.scheduleInputValues,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    }));

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="skills-hub-export-${date}.json"`,
      },
    });
  } catch (err) {
    console.error("GET /api/skills/export failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export skills" },
      { status: 500 }
    );
  }
}
