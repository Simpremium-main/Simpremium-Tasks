import { NextResponse } from "next/server";
import { getSkill, listExecutions } from "@/lib/data";
import { parseMarkdownTable } from "@/lib/resultTable";
import { buildCallbackBody } from "@/lib/outputCallback";

export const dynamic = "force-dynamic";

/**
 * No AI call — applies the skill's *already-saved* outputCallback mapping
 * (unlike .../preview, which proposes a new one) to its most recent
 * successful execution, so reopening components/OutputCallbackModal.tsx
 * can show what's actually configured for free, every time, instead of
 * only right after "Testar e gerar mapeamento" runs.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkill(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    if (!skill.outputCallback) {
      return NextResponse.json({ error: "Essa skill não tem retorno via API configurado" }, { status: 400 });
    }

    const recentSuccesses = await listExecutions({ skillId: skill.id, status: "success" });
    const sample = recentSuccesses.find((e) => e.result && parseMarkdownTable(e.result));
    // No qualifying execution yet is an expected, steady state for a
    // callback configured ahead of the skill's first real run (see
    // .../preview's noSample fallback) — not an error, so this stays a 200
    // with previewBody: null instead of a 400 the modal would show in red.
    if (!sample || !sample.result) {
      return NextResponse.json({ previewBody: null, sampleExecutionId: null, noSample: true });
    }

    const previewBody = buildCallbackBody(skill.outputCallback, sample.result);
    return NextResponse.json({ previewBody, sampleExecutionId: sample.id, noSample: false });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/output-callback/current-preview failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build current preview" },
      { status: 500 }
    );
  }
}
