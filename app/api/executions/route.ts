import { NextRequest, NextResponse } from "next/server";
import { listExecutions } from "@/lib/data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const skillId = searchParams.get("skillId") ?? undefined;

  const executions = await listExecutions({ status, skillId });

  return NextResponse.json(executions);
}
