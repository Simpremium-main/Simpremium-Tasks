import { NextRequest, NextResponse } from "next/server";
import { claimNextCoworkJob, recordCoworkAgentSeen } from "@/lib/data";
import { timingSafeEqualString } from "@/lib/tokenAuth";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.COWORK_AGENT_TOKEN;
  if (!token) return false;
  const auth = req.headers.get("authorization");
  return auth !== null && timingSafeEqualString(auth, `Bearer ${token}`);
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
    console.log("[cowork-agent-server] unauthorized poll (token missing or mismatched)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("[cowork-agent-server] authorized poll received");

  // Every authenticated poll — job or not — means the agent is alive right
  // now, which is what the dashboard's "agente visto há Xs" indicator
  // reads. Best-effort: a heartbeat write failing shouldn't ever block
  // handing the agent a real job.
  recordCoworkAgentSeen().catch((err) => console.error("recordCoworkAgentSeen failed:", err));

  try {
    const job = await claimNextCoworkJob();
    console.log(
      job
        ? `[cowork-agent-server] next-job: respondendo ao agente com a execução ${job.executionId} ("${job.skillName}")`
        : "[cowork-agent-server] next-job: respondendo ao agente com job=null (nada pra fazer agora)"
    );
    return NextResponse.json({ job });
  } catch (err) {
    console.error("GET /api/cowork-agent/next-job failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch next Cowork job" },
      { status: 500 }
    );
  }
}
