import { NextRequest, NextResponse } from "next/server";
import { updateExecution } from "@/lib/data";

// Deliberately narrow: executions are otherwise append-only/system-managed
// (createExecution/updateExecution elsewhere drive their own lifecycle) —
// `favorite` is the one field a person, not a run, is meant to change by
// hand, so it's the only one this route accepts.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.favorite !== "boolean") {
    return NextResponse.json({ error: "favorite must be a boolean" }, { status: 400 });
  }

  try {
    const execution = await updateExecution(params.id, { favorite: body.favorite });
    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }
    return NextResponse.json(execution);
  } catch (err) {
    console.error(`PATCH /api/executions/${params.id} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update execution" },
      { status: 500 }
    );
  }
}
