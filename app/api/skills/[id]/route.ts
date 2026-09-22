import { NextRequest, NextResponse } from "next/server";
import { deleteSkill, getSkillWithExecutions, updateSkill, type UpdateSkillInput } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";

// See app/api/skills/route.ts — same missing-dynamic CDN-caching gap.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkillWithExecutions(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (err) {
    console.error(`GET /api/skills/${params.id} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load skill" },
      { status: 500 }
    );
  }
}

const EDITABLE_FIELDS = [
  "name",
  "description",
  "promptTemplate",
  "needsInput",
  "usesCowork",
  "status",
  "group",
  "pinned",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const patch: UpdateSkillInput = {};

  for (const field of EDITABLE_FIELDS) {
    if (field in body) (patch as Record<string, unknown>)[field] = body[field];
  }

  // Drag-and-drop reorder (components/SkillsBoard.tsx) — a fractional
  // value between two neighbors, not a whitelisted-and-passed-through
  // field like the others above, since it needs its own finite-number
  // check rather than accepting whatever the request body happens to send.
  if ("position" in body) {
    if (typeof body.position !== "number" || !Number.isFinite(body.position)) {
      return NextResponse.json({ error: "position must be a finite number" }, { status: 400 });
    }
    patch.position = body.position;
  }

  if (Array.isArray(body.inputSchema)) {
    patch.inputSchema = body.inputSchema.length ? body.inputSchema : null;
  }

  if (Array.isArray(body.tags)) {
    patch.tags = body.tags.filter((t: unknown) => typeof t === "string" && t.trim());
  }

  if (patch.status && !["draft", "active", "archived"].includes(patch.status)) {
    return NextResponse.json({ error: "status must be draft, active or archived" }, { status: 400 });
  }

  if ("schedule" in body) {
    if (body.schedule === null) {
      patch.schedule = null;
    } else if (
      body.schedule &&
      ["daily", "weekly"].includes(body.schedule.frequency) &&
      typeof body.schedule.time === "string" &&
      /^\d{2}:\d{2}$/.test(body.schedule.time) &&
      (body.schedule.frequency !== "weekly" ||
        (Number.isInteger(body.schedule.dayOfWeek) && body.schedule.dayOfWeek >= 0 && body.schedule.dayOfWeek <= 6))
    ) {
      patch.schedule = {
        frequency: body.schedule.frequency,
        time: body.schedule.time,
        ...(body.schedule.frequency === "weekly" ? { dayOfWeek: body.schedule.dayOfWeek } : {}),
      };
    } else {
      return NextResponse.json({ error: "Invalid schedule" }, { status: 400 });
    }
  }

  if ("scheduleInputValues" in body) {
    patch.scheduleInputValues =
      body.scheduleInputValues && typeof body.scheduleInputValues === "object"
        ? body.scheduleInputValues
        : null;
  }

  try {
    const user = await getCurrentUser();
    const skill = await updateSkill(params.id, patch, user?.displayName ?? null);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (err) {
    console.error(`PATCH /api/skills/${params.id} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update skill" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteSkill(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/skills/${params.id} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete skill" },
      { status: 500 }
    );
  }
}
