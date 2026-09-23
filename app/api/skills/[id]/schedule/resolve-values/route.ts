import { NextResponse } from "next/server";
import { getSkill } from "@/lib/data";
import { resolveScheduledInputValues } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/**
 * Resolves the input values a scheduled run would use right now (static +
 * fresh API-sourced fields) without actually running the skill —
 * components/ScheduleModal.tsx's "Testar agora" calls this first, then
 * POSTs the result to POST /api/skills/[id]/run itself, so a manual test
 * genuinely exercises the same API sources the real cron-driven run would.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkill(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const resolved = await resolveScheduledInputValues(skill);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    return NextResponse.json({ values: resolved.values });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/schedule/resolve-values failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve scheduled input values" },
      { status: 500 }
    );
  }
}
