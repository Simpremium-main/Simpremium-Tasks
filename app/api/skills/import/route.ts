import { NextRequest, NextResponse } from "next/server";
import { createSkill } from "@/lib/data";
import type { InputField } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Bulk-creates skills from the shape GET /api/skills/export produces (or any
 * hand-written JSON matching it). Every imported skill lands as a fresh
 * "draft" — same reasoning as DuplicateSkillButton: it hasn't been tested
 * successfully in *this* environment yet, so it gets the same "prove it
 * works once" gate as a skill pasted in by hand, regardless of what status
 * or schedule it had wherever it was exported from. Schedule/status aren't
 * carried over on purpose — an imported skill running unattended before
 * anyone here has reviewed it would defeat that gate entirely.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.skills) ? body.skills : null;
  if (!items) {
    return NextResponse.json({ error: "Body must be { skills: [...] }" }, { status: 400 });
  }

  const results: { name: string; ok: boolean; id?: string; error?: string }[] = [];

  for (const item of items) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const promptTemplate = typeof item?.promptTemplate === "string" ? item.promptTemplate : "";
    if (!name || !promptTemplate) {
      results.push({ name: name || "(sem nome)", ok: false, error: "Faltando name ou promptTemplate" });
      continue;
    }

    const inputSchema: InputField[] = Array.isArray(item.inputSchema) ? item.inputSchema : [];
    const tags: string[] = Array.isArray(item.tags)
      ? item.tags.filter((t: unknown) => typeof t === "string" && t.trim())
      : [];

    try {
      const skill = await createSkill({
        name,
        description: typeof item.description === "string" ? item.description : "",
        promptTemplate,
        needsInput: Boolean(item.needsInput),
        usesCowork: Boolean(item.usesCowork),
        inputSchema,
        sourcePost: typeof item.sourcePost === "string" ? item.sourcePost : null,
        group: typeof item.group === "string" && item.group.trim() ? item.group.trim() : null,
        tags,
      });
      results.push({ name: skill.name, ok: true, id: skill.id });
    } catch (err) {
      results.push({ name, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json({ results });
}
