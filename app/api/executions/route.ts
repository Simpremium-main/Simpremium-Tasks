import { NextRequest, NextResponse } from "next/server";
import { listExecutions } from "@/lib/data";

// See app/api/skills/route.ts — same missing-dynamic CDN-caching gap.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const skillId = searchParams.get("skillId") ?? undefined;

  try {
    const executions = await listExecutions({ status, skillId });
    return NextResponse.json(executions);
  } catch (err) {
    console.error("GET /api/executions failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list executions" },
      { status: 500 }
    );
  }
}
