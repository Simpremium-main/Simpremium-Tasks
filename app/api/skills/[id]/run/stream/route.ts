import { NextRequest } from "next/server";
import { getSkill } from "@/lib/data";
import { runSkillMaybeSplit, runSkillStreaming } from "@/lib/runSkill";
import { getCurrentUser } from "@/lib/auth";
import { splitLinesByAccountGroups } from "@/lib/accountSplit";

export const dynamic = "force-dynamic";
// See the same export in ../route.ts for why this is set explicitly.
export const maxDuration = 300;

/**
 * Streams a skill run as Server-Sent Events instead of one blocking JSON
 * response, so the run panel can show Claude's answer building up live
 * ("Pensando...") instead of a spinner with nothing to look at until the
 * whole thing lands. Events:
 *   - "delta"    { text }      a chunk of the response as it streams in
 *   - "done"     Execution     the finished, saved execution row — sent more
 *                              than once in the same stream only when
 *                              Skill.accountSplit split this run into
 *                              several executions (Cowork never streams
 *                              deltas either way, so there's nothing to
 *                              interleave)
 *   - "continue" Execution     still running — a heavy skill hit this chunk's
 *                              time budget before finishing; the run panel
 *                              calls POST /api/executions/[id]/continue with
 *                              this execution's id to keep it going
 *   - "error"    { message }   something went wrong before an execution
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
  const dryRun = Boolean(body?.dryRun);

  const user = await getCurrentUser();

  // Checked up front, outside the try/catch below, purely to decide which
  // path to take — the real split (with its own error handling) happens
  // inside runSkillMaybeSplit either way.
  const splitField = skill.usesCowork && skill.accountSplit ? inputValues[skill.accountSplit.field] : undefined;
  const willSplit =
    skill.usesCowork &&
    skill.accountSplit &&
    typeof splitField === "string" &&
    splitLinesByAccountGroups(splitField, skill.accountSplit) !== null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (willSplit) {
          // Cowork dispatch never streams deltas (queueForCowork returns
          // immediately) — so a split run is just N executions, each sent
          // as its own "done" event on this same connection instead of
          // opening N separate streams.
          const executions = await runSkillMaybeSplit(skill, inputValues, user?.displayName ?? null, undefined, dryRun);
          for (const execution of executions) {
            controller.enqueue(sseFormat("done", execution));
          }
          return;
        }

        const { execution, done } = await runSkillStreaming(
          skill,
          inputValues,
          user?.displayName ?? null,
          (chunk) => {
            controller.enqueue(sseFormat("delta", { text: chunk }));
          },
          dryRun
        );
        controller.enqueue(sseFormat(done ? "done" : "continue", execution));
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
