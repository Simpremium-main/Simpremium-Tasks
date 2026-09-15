import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/data";
import { runSkill } from "@/lib/runSkill";
import { getCurrentUser } from "@/lib/auth";

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

    const user = await getCurrentUser();
    const execution = await runSkill(skill, inputValues, user?.email ?? null);
    return NextResponse.json(execution, { status: 201 });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/run failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run skill" },
      { status: 500 }
    );
  }
}
