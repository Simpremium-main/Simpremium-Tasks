import { NextRequest, NextResponse } from "next/server";
import { getExecution, getSkill } from "@/lib/data";
import { finishExecution } from "@/lib/runSkill";
import type { DispatchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.COWORK_AGENT_TOKEN;
  if (!token) return false;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

const ALLOWED_STATUSES: DispatchStatus[] = ["success", "error", "needs_setup"];

/**
 * The other half of the Mac mini agent's loop (see next-job/route.ts):
 * called once the agent has actually driven Cowork and has either a real
 * result or a real failure to report — never a partial or simulated
 * result, the agent itself decides success vs. error and this route just
 * finalizes the row exactly like any other dispatch path (finishExecution,
 * the same function Claude-direct and scheduled runs use), so a Cowork
 * result gets the same draft→active promotion and history behavior as any
 * other run.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    console.log("[cowork-agent-server] report-result: unauthorized (token missing or mismatched)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const executionId = typeof body?.executionId === "string" ? body.executionId : null;
  const dispatchStatus: DispatchStatus | null = ALLOWED_STATUSES.includes(body?.status)
    ? (body.status as DispatchStatus)
    : null;
  console.log(
    `[cowork-agent-server] report-result: recebido do agente — executionId=${executionId ?? "?"}, status=${body?.status ?? "?"}`
  );

  if (!executionId || !dispatchStatus) {
    console.log("[cowork-agent-server] report-result: executionId ou status inválido/ausente no corpo da requisição");
    return NextResponse.json({ error: "executionId and a valid status are required" }, { status: 400 });
  }

  try {
    const execution = await getExecution(executionId);
    if (!execution || execution.status !== "running") {
      console.log(
        `[cowork-agent-server] report-result: execução ${executionId} não encontrada ou não está "running" (status atual: ${execution?.status ?? "inexistente"})`
      );
      return NextResponse.json({ error: "No matching running execution found" }, { status: 404 });
    }

    const skill = await getSkill(execution.skillId);
    if (!skill) {
      console.log(`[cowork-agent-server] report-result: skill ${execution.skillId} não encontrada`);
      return NextResponse.json({ error: "Skill not found for this execution" }, { status: 404 });
    }

    const result = await finishExecution(skill, executionId, {
      status: dispatchStatus,
      result: typeof body.result === "string" ? body.result : undefined,
      error: typeof body.error === "string" ? body.error : undefined,
    });
    console.log(`[cowork-agent-server] report-result: execução ${executionId} finalizada com status "${dispatchStatus}"`);
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/cowork-agent/report-result failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to report Cowork result" },
      { status: 500 }
    );
  }
}
