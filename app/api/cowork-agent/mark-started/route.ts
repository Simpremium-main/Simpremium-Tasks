import { NextRequest, NextResponse } from "next/server";
import { markCoworkStarted } from "@/lib/data";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.COWORK_AGENT_TOKEN;
  if (!token) return false;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

/**
 * Called by the Mac mini agent right before it runs the AppleScript (see
 * mac-agent/agent.js's processJob) — separate from claimNextCoworkJob's
 * handoff, which only means the job left the queue, not that Cowork itself
 * has actually started on it. Lets the dashboard show "Cowork trabalhando
 * nisso há Xm" instead of a generic "running" that could just as easily
 * mean "still waiting in the queue". Same bearer-token auth as
 * next-job/report-result — this is the agent calling in, not a logged-in
 * browser.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const executionId = typeof body?.executionId === "string" ? body.executionId : null;
  if (!executionId) {
    return NextResponse.json({ error: "executionId is required" }, { status: 400 });
  }

  try {
    await markCoworkStarted(executionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/cowork-agent/mark-started failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to mark Cowork job as started" },
      { status: 500 }
    );
  }
}
