import { NextRequest, NextResponse } from "next/server";
import { disableSkillSharing, enableSkillSharing } from "@/lib/data";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await enableSkillSharing(params.id);
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    return NextResponse.json(skill);
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/share failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to enable sharing" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await disableSkillSharing(params.id);
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    return NextResponse.json(skill);
  } catch (err) {
    console.error(`DELETE /api/skills/${params.id}/share failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disable sharing" },
      { status: 500 }
    );
  }
}
