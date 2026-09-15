import { NextRequest, NextResponse } from "next/server";
import { deleteSkill, getSkillWithExecutions, updateSkill, type UpdateSkillInput } from "@/lib/data";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkillWithExecutions(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (err) {
    console.error(`GET /api/skills/${params.id} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load skill" },
      { status: 500 }
    );
  }
}

const EDITABLE_FIELDS = [
  "name",
  "description",
  "promptTemplate",
  "needsInput",
  "usesCowork",
  "status",
  "group",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const patch: UpdateSkillInput = {};

  for (const field of EDITABLE_FIELDS) {
    if (field in body) (patch as Record<string, unknown>)[field] = body[field];
  }

  if (Array.isArray(body.inputSchema)) {
    patch.inputSchema = body.inputSchema.length ? body.inputSchema : null;
  }

  if (Array.isArray(body.tags)) {
    patch.tags = body.tags.filter((t: unknown) => typeof t === "string" && t.trim());
  }

  if (patch.status && !["draft", "active", "archived"].includes(patch.status)) {
    return NextResponse.json({ error: "status must be draft, active or archived" }, { status: 400 });
  }

  try {
    const skill = await updateSkill(params.id, patch);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (err) {
    console.error(`PATCH /api/skills/${params.id} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update skill" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteSkill(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/skills/${params.id} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete skill" },
      { status: 500 }
    );
  }
}
