import { NextResponse } from "next/server";
import { getCoworkQueueSummary } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * For the dashboard's Cowork queue badge (components/CoworkQueueBadge.tsx)
 * to poll — normal session auth like the agent's own status endpoint
 * (app/api/cowork-agent/status/route.ts), since this is for the logged-in
 * browser, not the Mac mini agent.
 */
export async function GET() {
  try {
    const summary = await getCoworkQueueSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("GET /api/cowork-queue failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Cowork queue summary" },
      { status: 500 }
    );
  }
}
