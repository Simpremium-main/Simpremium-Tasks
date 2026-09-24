import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/data";
import { runSkillMaybeSplit } from "@/lib/runSkill";
import { getCurrentUser } from "@/lib/auth";

// A skill that fetches a page and generates a file via code execution can
// genuinely take a few minutes — default Vercel function duration is far
// shorter than that. 300s matches what's actually available without a
// higher-tier plan; bump this (and the same export in run/stream/route.ts)
// if the account's plan supports more.
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkill(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const inputValues: Record<string, string> =
      body && typeof body.inputValues === "object" && body.inputValues !== null
        ? body.inputValues
        : {};
    const dryRun = Boolean(body?.dryRun);

    const user = await getCurrentUser();
    // Usually one execution — more than one only when Skill.accountSplit
    // split these inputValues across several accounts (see
    // lib/runSkill.ts's runSkillMaybeSplit). Always an array in the
    // response, even for the common single-execution case, so callers
    // don't need two different shapes to handle.
    const executions = await runSkillMaybeSplit(skill, inputValues, user?.displayName ?? null, undefined, dryRun);
    return NextResponse.json({ executions }, { status: 201 });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/run failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run skill" },
      { status: 500 }
    );
  }
}
