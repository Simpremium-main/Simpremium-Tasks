import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const skillId = searchParams.get("skillId") ?? undefined;

  const executions = await prisma.execution.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(skillId ? { skillId } : {}),
    },
    orderBy: { startedAt: "desc" },
    include: { skill: { select: { id: true, name: true } } },
    take: 200,
  });

  return NextResponse.json(executions);
}
