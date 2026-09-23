import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/data";
import { applyApiFieldMapping } from "@/lib/apiFieldSource";
import { proposeApiFieldMapping } from "@/lib/proposeApiFieldMapping";

export const dynamic = "force-dynamic";

// A sample response is only ever used to generate the mapping, never
// stored — this just bounds how much a single test call can pull in.
const MAX_SAMPLE_CHARS = 500_000;

/**
 * Fetches a live sample from the API URL the person just typed into
 * components/ScheduleModal.tsx's "Buscar da API" config, asks Claude to
 * propose an ApiFieldMapping for it (lib/proposeApiFieldMapping.ts), and
 * applies that mapping to the same sample so the person sees the exact
 * text their scheduled run would get — before saving anything. Doesn't
 * persist the mapping itself; that only happens on the normal
 * PATCH /api/skills/[id] save, once they confirm the preview looks right.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkill(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const fieldKey = typeof body.fieldKey === "string" ? body.fieldKey : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const headers =
      body.headers && typeof body.headers === "object"
        ? (body.headers as Record<string, unknown>)
        : undefined;

    const field = (skill.inputSchema ?? []).find((f) => f.key === fieldKey);
    if (!field) {
      return NextResponse.json({ error: "Campo não encontrado no schema dessa skill" }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ error: "URL é obrigatória" }, { status: 400 });
    }

    const stringHeaders: Record<string, string> | undefined = headers
      ? Object.fromEntries(
          Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")
        )
      : undefined;

    let sampleJson: unknown;
    try {
      const res = await fetch(url, { headers: stringHeaders, cache: "no-store" });
      if (!res.ok) throw new Error(`A API respondeu HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_SAMPLE_CHARS) {
        throw new Error(`Resposta muito grande (${(text.length / 1024).toFixed(0)}KB) pra usar como amostra`);
      }
      sampleJson = JSON.parse(text);
    } catch (err) {
      return NextResponse.json(
        { error: `Falha ao buscar amostra da API: ${err instanceof Error ? err.message : "erro desconhecido"}` },
        { status: 400 }
      );
    }

    const mapping = await proposeApiFieldMapping({ field, sampleJson });
    const preview = applyApiFieldMapping(mapping, sampleJson);

    return NextResponse.json({ mapping, preview });
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/schedule/preview-field failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preview API field mapping" },
      { status: 500 }
    );
  }
}
