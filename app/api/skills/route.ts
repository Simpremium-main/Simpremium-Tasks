import { NextRequest, NextResponse } from "next/server";
import { createSkill, listSkills } from "@/lib/data";
import type { InputField } from "@/lib/types";

// Without this, a GET handler with no dynamic API call in its body (no
// cookies()/headers()/searchParams read) can get treated as static and
// cached at Vercel's CDN edge — the actual cause of the dashboard
// intermittently showing stale skills/executions until the CDN cache was
// manually purged. Every other data-reading API route in this app already
// has this; these few had simply been missed.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const skills = await listSkills();
    return NextResponse.json(skills);
  } catch (err) {
    console.error("GET /api/skills failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list skills" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const promptTemplate = typeof body.promptTemplate === "string" ? body.promptTemplate : "";

  if (!name || !promptTemplate) {
    return NextResponse.json(
      { error: "name and promptTemplate are required" },
      { status: 400 }
    );
  }

  const inputSchema: InputField[] = Array.isArray(body.inputSchema) ? body.inputSchema : [];
  const tags: string[] = Array.isArray(body.tags)
    ? body.tags.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim())
    : [];

  try {
    const skill = await createSkill({
      name,
      description,
      promptTemplate,
      needsInput: Boolean(body.needsInput),
      usesCowork: Boolean(body.usesCowork),
      inputSchema,
      sourcePost: typeof body.sourcePost === "string" ? body.sourcePost : null,
      group: typeof body.group === "string" && body.group.trim() ? body.group.trim() : null,
      tags,
    });
    return NextResponse.json(skill, { status: 201 });
  } catch (err) {
    console.error("POST /api/skills failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create skill" },
      { status: 500 }
    );
  }
}
