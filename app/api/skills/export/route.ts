import { NextRequest, NextResponse } from "next/server";
import { listSkills } from "@/lib/data";
import { maskValue } from "@/lib/mask";
import type { ApiFieldSource } from "@/lib/types";

export const dynamic = "force-dynamic";

// A backup file can end up in more places than the live dashboard (saved
// locally, shared, etc.), so unlike the live DB — where any Authorization
// header on an API source is stored in full to actually work — this masks
// it, same as every other credential this app ever writes to something
// that leaves the server. Import doesn't restore schedule/scheduleApiSources
// at all (see app/api/skills/import/route.ts), so this is for manual
// reference/restoration only, not a round-trippable secret.
function maskApiSources(
  sources: Record<string, ApiFieldSource[]> | null
): Record<string, ApiFieldSource[]> | null {
  if (!sources) return null;
  return Object.fromEntries(
    Object.entries(sources).map(([key, fieldSources]) => [
      key,
      fieldSources.map((source) => ({
        ...source,
        headers: source.headers
          ? Object.fromEntries(Object.entries(source.headers).map(([h, v]) => [h, maskValue(v)]))
          : source.headers,
      })),
    ])
  );
}

/**
 * A skill-definitions backup, not a full data export — no execution history,
 * no secret values (none are ever stored to begin with, see lib/mask.ts),
 * just enough to recreate every skill elsewhere or restore one you deleted
 * by hand. GET, not POST: this only reads.
 *
 * `?ids=a,b,c` narrows the export to just those skills — used by
 * SkillsBoard's bulk "Exportar selecionadas" action; omitted, it exports
 * everything, same as before this filter existed.
 */
export async function GET(req: NextRequest) {
  try {
    const idsParam = req.nextUrl.searchParams.get("ids");
    const ids = idsParam ? new Set(idsParam.split(",").filter(Boolean)) : null;

    const allSkills = await listSkills();
    const skills = ids ? allSkills.filter((s) => ids.has(s.id)) : allSkills;
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
      scheduleApiSources: maskApiSources(skill.scheduleApiSources),
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
