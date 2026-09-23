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
 * execution as the sample table, so testing this needs no extra typing —
 * just the target API's description — but does mean a skill needs at
 * least one real successful run before its callback can be configured.
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
    if (!sampleExecution || !sampleExecution.result) {
      return NextResponse.json(
        {
          error:
            "Essa skill ainda não tem nenhuma execução com sucesso cujo resultado tenha uma tabela — rode ela pelo menos uma vez antes de configurar o retorno via API.",
        },
        { status: 400 }
      );
    }

    const rows = parseMarkdownTable(sampleExecution.result)!;
    const proposed = await proposeOutputCallback({ apiDescription, sampleRow: rows[0] });

    const previewCallback: OutputCallback = {
      url: "",
      method: "POST",
      itemFieldMap: proposed.itemFieldMap,
      itemsPath: proposed.itemsPath,
    };
    const previewBody = buildCallbackBody(previewCallback, sampleExecution.result);

    return NextResponse.json({
      itemFieldMap: proposed.itemFieldMap,
      itemsPath: proposed.itemsPath,
      previewBody,
      sampleExecutionId: sampleExecution.id,
    });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/output-callback/preview failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preview output callback mapping" },
      { status: 500 }
    );
  }
}
