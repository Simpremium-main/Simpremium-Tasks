import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/data";
import { applyApiFieldMapping } from "@/lib/apiFieldSource";
import { proposeApiFieldMapping } from "@/lib/proposeApiFieldMapping";
import { logApiCall } from "@/lib/apiCallLog";

export const dynamic = "force-dynamic";

// A sample response is only ever used to generate the mapping, never
// stored — this just bounds how much a single test call can pull in.
// Applied in two stages: a generous hard ceiling on the raw fetch (protects
// against trying to JSON.parse a pathologically huge or non-JSON body), and
// a much smaller one on the *shape-preserving, array-truncated* sample
// actually sent to Claude — a real endpoint (e.g. "every pending
// activation") can legitimately return hundreds of records where the
// mapping only needs to see a handful to learn the shape.
const MAX_RAW_FETCH_CHARS = 5_000_000;
const MAX_SAMPLE_CHARS = 500_000;
const MAX_ARRAY_SAMPLE_ITEMS = 20;

/** Recursively caps every array in a parsed JSON value to its first N items
 *  — keeps the overall shape (so the mapping AI still sees real field names
 *  and nesting) while cutting a large list-of-records response down to a
 *  genuine "sample" instead of the whole dataset. */
function truncateArraysDeep(value: unknown, maxItems: number): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, maxItems).map((item) => truncateArraysDeep(item, maxItems));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, truncateArraysDeep(v, maxItems)])
    );
  }
  return value;
}

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
    let fetchedStatus: number | undefined;
    let fetchedText: string | undefined;
    try {
      const res = await fetch(url, { headers: stringHeaders, cache: "no-store" });
      fetchedStatus = res.status;
      if (!res.ok) throw new Error(`A API respondeu HTTP ${res.status}`);
      const text = await res.text();
      fetchedText = text;
      if (text.length > MAX_RAW_FETCH_CHARS) {
        throw new Error(`Resposta muito grande (${(text.length / 1024).toFixed(0)}KB) pra sequer processar`);
      }
      const parsed = JSON.parse(text);
      sampleJson = truncateArraysDeep(parsed, MAX_ARRAY_SAMPLE_ITEMS);
      const sampleText = JSON.stringify(sampleJson);
      if (sampleText.length > MAX_SAMPLE_CHARS) {
        throw new Error(
          `Resposta muito grande (${(sampleText.length / 1024).toFixed(0)}KB) pra usar como amostra, mesmo só ` +
            `com os primeiros ${MAX_ARRAY_SAMPLE_ITEMS} itens de cada lista — os objetos individuais são grandes demais`
        );
      }
      await logApiCall({
        skillId: skill.id,
        fieldKey,
        direction: "input",
        kind: "test",
        url,
        method: "GET",
        requestHeaders: stringHeaders,
        responseStatus: fetchedStatus,
        responseBody: fetchedText,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      await logApiCall({
        skillId: skill.id,
        fieldKey,
        direction: "input",
        kind: "test",
        url,
        method: "GET",
        requestHeaders: stringHeaders,
        responseStatus: fetchedStatus,
        responseBody: fetchedText,
        error: message,
      });
      return NextResponse.json(
        { error: `Falha ao buscar amostra da API: ${message}` },
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
