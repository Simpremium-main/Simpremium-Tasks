import { NextResponse } from "next/server";
import { listAllExecutionsForExport } from "@/lib/data";
import { estimateCostUsd } from "@/lib/cost";
import { executionDurationMs } from "@/lib/duration";

export const dynamic = "force-dynamic";

// RFC 4180: wrap in quotes and double up any quote already inside; only
// needed for fields that can contain a comma, quote, or newline (result/
// error text, mainly) — wrapping everything would just be noise, but it's
// always safe, so simplest to just always do it.
function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const COLUMNS = [
  "id",
  "skill_name",
  "status",
  "source",
  "started_at",
  "finished_at",
  "duration_seconds",
  "ran_by",
  "favorite",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "estimated_cost_usd",
  "files_count",
  "result",
  "error",
] as const;

/**
 * A genuine full backup/analysis export of every execution ever recorded —
 * unlike GET /api/skills/export (skill definitions only), this is the
 * actual run history: what ran, when, how much it cost, what it produced.
 * CSV rather than JSON on purpose, since "backup or external analysis"
 * (the original ask) means opening it in Excel/Sheets, not re-importing it
 * into this app — there's no matching import route for this shape.
 */
export async function GET() {
  try {
    const executions = await listAllExecutionsForExport();

    const rows = executions.map((e) => {
      const durationMs = e.finishedAt ? executionDurationMs(e.startedAt.toISOString(), e.finishedAt.toISOString()) : null;
      return [
        e.id,
        e.skill.name,
        e.status,
        e.source,
        e.startedAt.toISOString(),
        e.finishedAt?.toISOString() ?? "",
        durationMs !== null ? Math.round(durationMs / 1000) : "",
        e.ranBy ?? "",
        e.favorite ? "yes" : "no",
        e.usage?.inputTokens ?? "",
        e.usage?.outputTokens ?? "",
        e.usage?.cacheReadInputTokens ?? "",
        e.usage ? estimateCostUsd(e.usage).toFixed(4) : "",
        e.files?.length ?? 0,
        e.result ?? "",
        e.error ?? "",
      ];
    });

    const csv = [COLUMNS.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="skills-hub-execucoes-${date}.csv"`,
      },
    });
  } catch (err) {
    console.error("GET /api/executions/export failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export executions" },
      { status: 500 }
    );
  }
}
