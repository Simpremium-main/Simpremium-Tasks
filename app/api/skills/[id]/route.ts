import { NextRequest, NextResponse } from "next/server";
import { deleteSkill, getSkillWithExecutions, updateSkill, type UpdateSkillInput } from "@/lib/data";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const skill = await getSkillWithExecutions(params.id);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json(skill);
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

  if (patch.status && !["draft", "active"].includes(patch.status)) {
    return NextResponse.json({ error: "status must be draft or active" }, { status: 400 });
  }

  const skill = await updateSkill(params.id, patch);
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  return NextResponse.json(skill);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await deleteSkill(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
