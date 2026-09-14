import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { InputField } from "@/lib/types";

export async function GET() {
  const skills = await prisma.skill.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { executions: true } } },
  });
  return NextResponse.json(skills);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const promptTemplate = typeof body.promptTemplate === "string" ? body.promptTemplate : "";

  if (!name || !promptTemplate) {
    return NextResponse.json(
      { error: "name and promptTemplate are required" },
      { status: 400 }
    );
  }

  const inputSchema: InputField[] = Array.isArray(body.inputSchema) ? body.inputSchema : [];

  const skill = await prisma.skill.create({
    data: {
      name,
      description,
      promptTemplate,
      needsInput: Boolean(body.needsInput),
      usesCowork: Boolean(body.usesCowork),
      inputSchema: inputSchema.length ? JSON.stringify(inputSchema) : null,
      sourcePost: typeof body.sourcePost === "string" ? body.sourcePost : null,
      status: "draft",
    },
  });

  return NextResponse.json(skill, { status: 201 });
}
