import { NextRequest } from "next/server";
import { getExecution, getSkill } from "@/lib/data";
import { continueSkillRun } from "@/lib/runSkill";

export const dynamic = "force-dynamic";
// See app/api/skills/[id]/run/route.ts for why this is set explicitly.
export const maxDuration = 300;

/**
 * Continues a Claude-direct run that a previous chunk left "running" with
 * saved conversation state — see lib/runSkill.ts's advance()/MAX_CHUNKS.
 * Same event shape as POST /api/skills/[id]/run/stream: "delta", then
 * "done" or "continue" (call this route again with the same execution id),
 * or "error".
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const encoder = new TextEncoder();

  function sseFormat(event: string, data: unknown) {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const execution = await getExecution(params.id);
  if (!execution) {
    return new Response(sseFormat("error", { message: "Execution not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  if (execution.status !== "running" || !execution.conversationState) {
    return new Response(
      sseFormat("error", { message: "This execution isn't waiting to be continued." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const skill = await getSkill(execution.skillId);
  if (!skill) {
    return new Response(sseFormat("error", { message: "Skill not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { execution: updated, done } = await continueSkillRun(skill, execution, (chunk) => {
          controller.enqueue(sseFormat("delta", { text: chunk }));
        });
        controller.enqueue(sseFormat(done ? "done" : "continue", updated));
      } catch (err) {
        console.error(`POST /api/executions/${params.id}/continue failed:`, err);
        controller.enqueue(
          sseFormat("error", {
            message: err instanceof Error ? err.message : "Failed to continue the run",
          })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
