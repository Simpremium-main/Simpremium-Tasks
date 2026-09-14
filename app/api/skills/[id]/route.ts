import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const skill = await prisma.skill.findUnique({
    where: { id: params.id },
    include: { executions: { orderBy: { startedAt: "desc" } } },
  });

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
] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: Record<string, unknown> = {};

  for (const field of EDITABLE_FIELDS) {
    if (field in body) data[field] = body[field];
  }

  if (Array.isArray(body.inputSchema)) {
    data.inputSchema = body.inputSchema.length ? JSON.stringify(body.inputSchema) : null;
  }

  if (data.status && !["draft", "active"].includes(data.status as string)) {
    return NextResponse.json({ error: "status must be draft or active" }, { status: 400 });
  }

  try {
    const skill = await prisma.skill.update({ where: { id: params.id }, data });
    return NextResponse.json(skill);
  } catch {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.skill.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
}
