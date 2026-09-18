import { NextRequest, NextResponse } from "next/server";
import { claimNextCoworkJob } from "@/lib/data";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.COWORK_AGENT_TOKEN;
  if (!token) return false;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

/**
 * Polled by the Mac mini agent (see mac-agent/ at the repo root) — no
 * inbound networking needed on the agent's side, it just calls out to
 * this on a loop, which is why this is a poll rather than a webhook: the
 * agent runs on a machine with no public address. Hands back the oldest
 * queued Cowork job, if any, and clears its stored prompt in the same
 * call (see lib/data.ts's claimNextCoworkJob) so it can't be handed to a
 * second poll and doesn't sit in the database a moment longer than
 * necessary.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const job = await claimNextCoworkJob();
    return NextResponse.json({ job });
  } catch (err) {
    console.error("GET /api/cowork-agent/next-job failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch next Cowork job" },
      { status: 500 }
    );
  }
}
