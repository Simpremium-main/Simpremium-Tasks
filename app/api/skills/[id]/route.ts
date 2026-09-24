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

  if ("scheduleApiSources" in body) {
    patch.scheduleApiSources =
      body.scheduleApiSources && typeof body.scheduleApiSources === "object"
        ? body.scheduleApiSources
        : null;
  }

  if ("outputCallbacks" in body) {
    if (body.outputCallbacks === null) {
      patch.outputCallbacks = null;
    } else if (Array.isArray(body.outputCallbacks)) {
      const valid = body.outputCallbacks.every(
        (c: unknown) => c && typeof c === "object" && typeof (c as { url?: unknown }).url === "string"
      );
      if (!valid) {
        return NextResponse.json({ error: "outputCallbacks must be an array of OutputCallback objects" }, { status: 400 });
      }
      patch.outputCallbacks = body.outputCallbacks.length ? body.outputCallbacks : null;
    } else {
      return NextResponse.json({ error: "outputCallbacks must be an array or null" }, { status: 400 });
    }
  }

  if ("systemSecrets" in body) {
    if (body.systemSecrets === null) {
      patch.systemSecrets = null;
    } else if (Array.isArray(body.systemSecrets)) {
      const names: string[] = body.systemSecrets.filter(
        (n: unknown): n is string => typeof n === "string" && n.trim().length > 0
      );
      // Every name must live in the SKILL_SECRET_ namespace — a skill's
      // own definition is editable by anyone with dashboard access, so
      // without this the field would be a way to point a prompt at any
      // other server env var (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY,
      // ...) instead of just the credentials meant for this purpose. See
      // lib/systemSecrets.ts, which enforces the same rule again on resolve.
      const invalid = names.filter((n) => !/^SKILL_SECRET_[A-Z0-9_]+$/.test(n));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Nome(s) de variável inválido(s) — precisa começar com SKILL_SECRET_: ${invalid.join(", ")}` },
          { status: 400 }
        );
      }
      patch.systemSecrets = names.length ? names : null;
    } else {
      return NextResponse.json({ error: "systemSecrets must be an array of strings or null" }, { status: 400 });
    }
  }

  if ("accountSplit" in body) {
    if (body.accountSplit === null) {
      patch.accountSplit = null;
    } else if (
      body.accountSplit &&
      typeof body.accountSplit === "object" &&
      typeof body.accountSplit.field === "string" &&
      body.accountSplit.field.trim() &&
      Array.isArray(body.accountSplit.groups)
    ) {
      const groups = body.accountSplit.groups;
      const valid = groups.every(
        (g: unknown) =>
          g &&
          typeof g === "object" &&
          typeof (g as { label?: unknown }).label === "string" &&
          (g as { label: string }).label.trim() &&
          typeof (g as { pattern?: unknown }).pattern === "string" &&
          (g as { pattern: string }).pattern.trim() &&
          typeof (g as { claudeInstanceId?: unknown }).claudeInstanceId === "string" &&
          (g as { claudeInstanceId: string }).claudeInstanceId.trim()
      );
      if (!valid) {
        return NextResponse.json(
          { error: "accountSplit.groups must each have a non-empty label, pattern and claudeInstanceId" },
          { status: 400 }
        );
      }
      // Every pattern is used as a RegExp source at split time (see
      // lib/accountSplit.ts) — reject here rather than let a typo blow up
      // silently on the next run.
      const badPattern = groups.find((g: { pattern: string }) => {
        try {
          new RegExp(g.pattern, "i");
          return false;
        } catch {
          return true;
        }
      });
      if (badPattern) {
        return NextResponse.json(
          { error: `Padrão inválido em accountSplit: "${badPattern.pattern}" não é uma expressão regular válida` },
          { status: 400 }
        );
      }
      // claudeInstanceId becomes part of a filesystem path and a process
      // lookup on the Mac mini agent (mac-agent/agent.js's
      // findRunningInstancePid) — restricted to a safe slug so a typo or a
      // pasted value can't produce a surprising path/process match.
      const badInstanceId = groups.find(
        (g: { claudeInstanceId: string }) => !/^[a-zA-Z0-9_-]+$/.test(g.claudeInstanceId)
      );
      if (badInstanceId) {
        return NextResponse.json(
          {
            error: `claudeInstanceId inválido: "${badInstanceId.claudeInstanceId}" — só letras, números, "-" e "_"`,
          },
          { status: 400 }
        );
      }
      const cleanGroups = groups.map((g: { label: string; pattern: string; claudeInstanceId: string }) => ({
        label: g.label,
        pattern: g.pattern,
        claudeInstanceId: g.claudeInstanceId,
      }));
      patch.accountSplit = cleanGroups.length ? { field: body.accountSplit.field, groups: cleanGroups } : null;
    } else {
      return NextResponse.json(
        { error: "accountSplit must be null or {field, groups: [{label, pattern, claudeInstanceId}]}" },
        { status: 400 }
      );
    }
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
