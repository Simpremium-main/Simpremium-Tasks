import { NextRequest, NextResponse } from "next/server";
import { getCoworkQueueSummary, setCoworkQueuePaused } from "@/lib/data";

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

/**
 * The kill switch itself — flips cowork_agent_status.queue_paused, which
 * claimNextCoworkJob checks before handing anything to the agent. Stops new
 * work from being dispatched without needing to kill mac-agent/agent.js on
 * the Mac mini itself.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "paused must be a boolean" }, { status: 400 });
  }
  try {
    await setCoworkQueuePaused(body.paused);
    const summary = await getCoworkQueueSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("PATCH /api/cowork-queue failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update Cowork queue pause state" },
      { status: 500 }
    );
  }
}
