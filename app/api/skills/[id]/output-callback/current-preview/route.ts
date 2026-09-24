import { NextRequest, NextResponse } from "next/server";
import { getSkill, listExecutions } from "@/lib/data";
import { parseMarkdownTable } from "@/lib/resultTable";
import { buildCallbackBody } from "@/lib/outputCallback";

export const dynamic = "force-dynamic";

/**
 * No AI call — applies an *already-saved* mapping (itemFieldMap/itemsPath,
 * passed in the body — a skill can have several output callbacks now, so
 * this takes the specific one being reopened rather than reading a single
 * field off the skill) to the skill's most recent successful execution, so
 * reopening components/OutputCallbackModal.tsx can show what's actually
 * configured for free, every time, instead of only right after "Testar e
 * gerar mapeamento" runs.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkill(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const itemFieldMap = Array.isArray(body.itemFieldMap) ? body.itemFieldMap : null;
    const itemsPath = typeof body.itemsPath === "string" ? body.itemsPath : "";
    if (!itemFieldMap) {
      return NextResponse.json({ error: "itemFieldMap é obrigatório" }, { status: 400 });
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

    const previewBody = buildCallbackBody({ url: "", method: "POST", itemFieldMap, itemsPath }, sample.result);
    return NextResponse.json({ previewBody, sampleExecutionId: sample.id, noSample: false });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/output-callback/current-preview failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build current preview" },
      { status: 500 }
    );
  }
}
