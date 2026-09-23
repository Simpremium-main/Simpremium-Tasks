import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/data";
import { logApiCall } from "@/lib/apiCallLog";

export const dynamic = "force-dynamic";

// Same backstop as the other raw-fetch call in this app (preview-field's
// MAX_RAW_FETCH_CHARS) — this is a debugging view, not a data pipeline, so
// there's no need to actually parse/hold anything gigantic in memory.
const MAX_RAW_FETCH_CHARS = 5_000_000;

/**
 * Fetches an API-sourced field's URL and returns the raw response
 * unmodified (pretty-printed if it's valid JSON) — no AI call, no mapping,
 * unlike .../preview-field. For "I just want to see what this API actually
 * returns" before deciding how to map it, or to sanity-check a mapping
 * that's producing an unexpected value. Logged the same as every other
 * outbound call this app makes (lib/apiCallLog.ts).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skill = await getSkill(params.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const fieldKey = typeof body.fieldKey === "string" ? body.fieldKey : null;
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const headers =
      body.headers && typeof body.headers === "object" ? (body.headers as Record<string, unknown>) : undefined;
    if (!url) {
      return NextResponse.json({ error: "URL é obrigatória" }, { status: 400 });
    }

    const stringHeaders: Record<string, string> | undefined = headers
      ? Object.fromEntries(
          Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")
        )
      : undefined;

    try {
      const res = await fetch(url, { headers: stringHeaders, cache: "no-store" });
      const text = await res.text();
      const truncated = text.length > MAX_RAW_FETCH_CHARS;
      const loggedBody = truncated ? text.slice(0, MAX_RAW_FETCH_CHARS) : text;

      await logApiCall({
        skillId: skill.id,
        fieldKey,
        direction: "input",
        kind: "raw",
        url,
        method: "GET",
        requestHeaders: stringHeaders,
        responseStatus: res.status,
        responseBody: loggedBody,
        error: res.ok ? null : `HTTP ${res.status}`,
      });

      let display = text;
      try {
        display = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Not JSON — show as-is.
      }

      return NextResponse.json({ status: res.status, ok: res.ok, body: display, truncated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao buscar";
      await logApiCall({
        skillId: skill.id,
        fieldKey,
        direction: "input",
        kind: "raw",
        url,
        method: "GET",
        requestHeaders: stringHeaders,
        error: message,
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (err) {
    console.error(`POST /api/skills/${params.id}/schedule/raw-response failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch raw response" },
      { status: 500 }
    );
  }
}
