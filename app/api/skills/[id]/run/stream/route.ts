import { NextRequest } from "next/server";
import { getSkill } from "@/lib/data";
import { runSkillStreaming } from "@/lib/runSkill";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Streams a skill run as Server-Sent Events instead of one blocking JSON
 * response, so the run panel can show Claude's answer building up live
 * ("Pensando...") instead of a spinner with nothing to look at until the
 * whole thing lands. Events:
 *   - "delta" { text }         a chunk of the response as it streams in
 *   - "done"  Execution        the finished, saved execution row
 *   - "error" { message }      something went wrong before an execution
 *                              could even be recorded (e.g. skill not found)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const encoder = new TextEncoder();

  function sseFormat(event: string, data: unknown) {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const skill = await getSkill(params.id);
  if (!skill) {
    return new Response(sseFormat("error", { message: "Skill not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const inputValues: Record<string, string> =
    body && typeof body.inputValues === "object" && body.inputValues !== null
      ? body.inputValues
      : {};

  const user = await getCurrentUser();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const execution = await runSkillStreaming(skill, inputValues, user?.email ?? null, (chunk) => {
          controller.enqueue(sseFormat("delta", { text: chunk }));
        });
        controller.enqueue(sseFormat("done", execution));
      } catch (err) {
        console.error(`POST /api/skills/${params.id}/run/stream failed:`, err);
        controller.enqueue(
          sseFormat("error", {
            message: err instanceof Error ? err.message : "Failed to run skill",
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
