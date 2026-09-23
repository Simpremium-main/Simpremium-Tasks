import { getSupabase } from "./supabaseClient";
import { maskValue } from "./mask";
import type { ApiCallDirection, ApiCallKind } from "./types";

// Keeps a single pathological response from filling the table — this is a
// debugging trail, not a data store, so a truncated tail is fine.
const MAX_LOGGED_BODY_CHARS = 20_000;

function maskHeaders(headers: Record<string, string> | null | undefined): Record<string, string> | null {
  if (!headers) return null;
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, maskValue(value)]));
}

/**
 * Records one outbound HTTP call this app made to an external system —
 * every real call site (lib/apiFieldSource.ts's fetchApiFieldValue,
 * lib/outputCallback.ts's sendOutputCallback, the schedule preview-field
 * and raw-response routes) calls this itself, right after the fetch,
 * success or failure. Never throws: a logging failure must never break the
 * real call it's describing — this is purely an audit trail
 * (app/(app)/api-logs), not something any runtime logic depends on.
 */
export async function logApiCall(entry: {
  skillId: string | null;
  fieldKey?: string | null;
  direction: ApiCallDirection;
  kind: ApiCallKind;
  url: string;
  method: string;
  requestHeaders?: Record<string, string> | null;
  requestBody?: string | null;
  responseStatus?: number | null;
  responseBody?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("api_call_logs").insert({
      skill_id: entry.skillId,
      field_key: entry.fieldKey ?? null,
      direction: entry.direction,
      kind: entry.kind,
      url: entry.url,
      method: entry.method,
      request_headers: maskHeaders(entry.requestHeaders),
      request_body: entry.requestBody ? entry.requestBody.slice(0, MAX_LOGGED_BODY_CHARS) : null,
      response_status: entry.responseStatus ?? null,
      response_body: entry.responseBody ? entry.responseBody.slice(0, MAX_LOGGED_BODY_CHARS) : null,
      error: entry.error ?? null,
    });
    if (error) console.error("logApiCall insert failed:", error.message);
  } catch (err) {
    console.error("logApiCall failed:", err);
  }
}
