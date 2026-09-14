import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/data";
import { runSkill } from "@/lib/runSkill";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const skill = await getSkill(params.id);
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const inputValues: Record<string, string> =
    body && typeof body.inputValues === "object" && body.inputValues !== null
      ? body.inputValues
      : {};

  const execution = await runSkill(skill, inputValues);
  return NextResponse.json(execution, { status: 201 });
}
