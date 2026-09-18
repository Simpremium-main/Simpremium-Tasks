import { NextResponse } from "next/server";
import { getCoworkAgentLastSeen } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * For the dashboard's own "agente visto há Xs" indicator
 * (components/CoworkAgentStatus.tsx) to poll — this one's for the logged-in
 * browser, so it stays behind the normal session gate in middleware.ts
 * (unlike next-job/report-result, which the Mac mini agent calls with its
 * own bearer token instead of a session).
 */
export async function GET() {
  try {
    const lastSeenAt = await getCoworkAgentLastSeen();
    return NextResponse.json({ lastSeenAt: lastSeenAt?.toISOString() ?? null });
  } catch (err) {
    console.error("GET /api/cowork-agent/status failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Cowork agent status" },
      { status: 500 }
    );
  }
}
