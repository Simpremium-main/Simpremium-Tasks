import { NextResponse } from "next/server";
import { listActiveExecutions } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const executions = await listActiveExecutions();
    return NextResponse.json(executions);
  } catch (err) {
    console.error("GET /api/executions/active failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load active executions" },
      { status: 500 }
    );
  }
}
