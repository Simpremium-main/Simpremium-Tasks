import { NextRequest, NextResponse } from "next/server";
import { getSkill, listExecutions } from "@/lib/data";
import { parseMarkdownTable } from "@/lib/resultTable";
import { buildCallbackBody } from "@/lib/outputCallback";
import { proposeOutputCallback } from "@/lib/proposeOutputCallback";
import type { OutputCallback } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Setup/preview only — NEVER actually calls the target API (unlike
 * lib/outputCallback.ts's sendOutputCallback, which only ever runs for
 * real from lib/runSkill.ts's finishExecution, as a genuine side effect of
 * a real run finishing). Uses this skill's own most recent successful
 * execution as the sample table when there is one, so testing this
 * normally needs no extra typing — just the target API's description.
 *
 * When there's no qualifying execution yet, this still generates a mapping
 * (lib/proposeOutputCallback.ts falls back to a best-effort guess from the
 * API description alone) rather than blocking setup on the skill's first
 * real run — `noSample: true` in the response tells the modal to flag it
 * as unverified instead of showing a live preview body.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkill(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const apiDescription = typeof body.apiDescription === "string" ? body.apiDescription.trim() : "";
    if (!apiDescription) {
      return NextResponse.json({ error: "Descrição da API de destino é obrigatória" }, { status: 400 });
    }

    const recentSuccesses = await listExecutions({ skillId: skill.id, status: "success" });
    const sampleExecution = recentSuccesses.find((e) => e.result && parseMarkdownTable(e.result));
    const rows = sampleExecution?.result ? parseMarkdownTable(sampleExecution.result) : null;
    const sampleRow = rows && rows.length > 0 ? rows[0] : null;

    const proposed = await proposeOutputCallback({ apiDescription, sampleRow });

    const previewCallback: OutputCallback = {
      url: "",
      method: "POST",
      itemFieldMap: proposed.itemFieldMap,
      itemsPath: proposed.itemsPath,
    };
    const previewBody =
      sampleExecution?.result ? buildCallbackBody(previewCallback, sampleExecution.result) : null;

    return NextResponse.json({
      itemFieldMap: proposed.itemFieldMap,
      itemsPath: proposed.itemsPath,
      previewBody,
      sampleExecutionId: sampleExecution?.id ?? null,
      noSample: !sampleExecution,
    });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/output-callback/preview failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preview output callback mapping" },
      { status: 500 }
    );
  }
}
