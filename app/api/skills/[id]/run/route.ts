import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runSkill } from "@/lib/runSkill";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const skill = await prisma.skill.findUnique({ where: { id: params.id } });
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
