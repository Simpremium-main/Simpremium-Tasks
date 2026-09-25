import { NextRequest, NextResponse } from "next/server";
import { updateExecution } from "@/lib/data";
import type { UpdateExecutionInput } from "@/lib/data";

// Deliberately narrow: executions are otherwise append-only/system-managed
// (createExecution/updateExecution elsewhere drive their own lifecycle) —
// favorite/archived are the two fields a person, not a run, is meant to
// change by hand, so they're the only ones this route accepts.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const patch: UpdateExecutionInput = {};

  if ("favorite" in body) {
    if (typeof body.favorite !== "boolean") {
      return NextResponse.json({ error: "favorite must be a boolean" }, { status: 400 });
    }
    patch.favorite = body.favorite;
  }

  if ("archived" in body) {
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
    }
    patch.archived = body.archived;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "favorite and/or archived must be provided" }, { status: 400 });
  }

  try {
    const execution = await updateExecution(params.id, patch);
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
