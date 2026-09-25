import { NextRequest, NextResponse } from "next/server";
import { getExecution } from "@/lib/data";
import { timingSafeEqualString } from "@/lib/tokenAuth";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.COWORK_AGENT_TOKEN;
  if (!token) return false;
  const auth = req.headers.get("authorization");
  return auth !== null && timingSafeEqualString(auth, `Bearer ${token}`);
}

/**
 * Lets the Mac mini agent check whether an execution it's still "waiting"
 * on (watching for the local results file) has already been finalized
 * through a different path — namely the MCP report-result tool
 * (mac-agent/mcp-report-result/) calling POST /api/cowork-agent/report-result
 * directly. Without this, the agent has no way to know a job is done until
 * either the file shows up or the full timeout elapses, even when the
 * result already landed minutes ago via MCP — see mac-agent/agent.js's
 * waitForResult.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const executionId = req.nextUrl.searchParams.get("id");
  if (!executionId) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  try {
    const execution = await getExecution(executionId);
    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }
    return NextResponse.json({ status: execution.status });
  } catch (err) {
    console.error("GET /api/cowork-agent/execution-status failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch execution status" },
      { status: 500 }
    );
  }
}
