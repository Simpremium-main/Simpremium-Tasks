import { logApiCall } from "./apiCallLog";
import type { ApiFieldMapping, ApiFieldSource } from "./types";

/**
 * A tiny, safe path reader — no eval, no JSONPath library, just
 * dot-separated keys with optional [n] array indices ("" reaches the root
 * value itself). Returns undefined for anything that doesn't resolve,
 * rather than throwing, since a mapping generated from one sample response
 * might reasonably hit a missing/null field on a different call.
 */
function getPath(data: unknown, path: string): unknown {
  if (!path) return data;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function toDisplayString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function fillItemTemplate(template: string, item: unknown): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (!item || typeof item !== "object") return "";
    return toDisplayString((item as Record<string, unknown>)[key]);
  });
}

/** Applies a saved mapping to a real API response, producing the exact
 *  string a scheduled run's input field should get. Throws (with a message
 *  meant to be shown as-is) when the response's actual shape doesn't match
 *  what the mapping expects — e.g. listPath not pointing at an array — so a
 *  scheduled run reports a clear error instead of silently using an empty
 *  value, per this app's "never fail silently" rule. */
export function applyApiFieldMapping(mapping: ApiFieldMapping, data: unknown): string {
  if (mapping.kind === "single") {
    return toDisplayString(getPath(data, mapping.path));
  }

  const listValue = getPath(data, mapping.listPath);
  if (!Array.isArray(listValue)) {
    throw new Error(
      `O mapeamento espera uma lista em "${mapping.listPath || "(raiz)"}", mas a API não retornou isso.`
    );
  }

  const items = mapping.filter
    ? listValue.filter((item) => {
        if (!item || typeof item !== "object") return false;
        return toDisplayString((item as Record<string, unknown>)[mapping.filter!.field]) === mapping.filter!.equals;
      })
    : listValue;

  return items.map((item) => fillItemTemplate(mapping.itemTemplate, item)).join(mapping.join || "\n");
}

/** A plain-language summary of what a saved mapping actually does — shown
 *  in components/ScheduleModal.tsx when reopening a field that's already
 *  configured, so what's saved is visible without re-testing (which would
 *  otherwise be the only way to see it again). */
export function describeApiFieldMapping(mapping: ApiFieldMapping): string {
  if (mapping.kind === "single") {
    return mapping.path ? `O valor em "${mapping.path}" da resposta` : "O valor retornado pela API, direto";
  }
  const base = mapping.listPath
    ? `Uma linha por item da lista em "${mapping.listPath}"`
    : "Uma linha por item da lista retornada";
  const filterPart = mapping.filter
    ? `, só os itens com "${mapping.filter.field}" = "${mapping.filter.equals}"`
    : "";
  return `${base}${filterPart}, no formato: ${mapping.itemTemplate}`;
}

/** Fetches an API-sourced field's current value fresh — called right before
 *  a scheduled run, never cached, so it reflects whatever the external
 *  system says right now (the whole point of this over a fixed saved
 *  value). `cache: "no-store"` for the same reason every dynamic route in
 *  this app avoids Next's Data Cache — a stale fetch here would defeat the
 *  feature. */
export async function fetchApiFieldValue(
  source: ApiFieldSource,
  // Only present for a real dispatch (the cron job, "Testar agora", or the
  // manual "Buscar dados da API" button) — logged against the skill so
  // app/(app)/api-logs can show it; omitted from an AI-mapping-preview call
  // (lib/proposeApiFieldMapping.ts's caller fetches the sample itself and
  // logs it separately, kind: "test").
  context?: { skillId: string; fieldKey: string }
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(source.url, { headers: source.headers ?? undefined, cache: "no-store" });
  } catch (err) {
    const message = `Falha ao conectar em "${source.url}": ${err instanceof Error ? err.message : "erro desconhecido"}`;
    if (context) {
      await logApiCall({
        skillId: context.skillId,
        fieldKey: context.fieldKey,
        direction: "input",
        kind: "fetch",
        url: source.url,
        method: "GET",
        requestHeaders: source.headers,
        error: message,
      });
    }
    throw new Error(message);
  }

  const text = await res.text();

  if (!res.ok) {
    const message = `"${source.url}" respondeu HTTP ${res.status}`;
    if (context) {
      await logApiCall({
        skillId: context.skillId,
        fieldKey: context.fieldKey,
        direction: "input",
        kind: "fetch",
        url: source.url,
        method: "GET",
        requestHeaders: source.headers,
        responseStatus: res.status,
        responseBody: text,
        error: message,
      });
    }
    throw new Error(message);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const message = `"${source.url}" não retornou um JSON válido`;
    if (context) {
      await logApiCall({
        skillId: context.skillId,
        fieldKey: context.fieldKey,
        direction: "input",
        kind: "fetch",
        url: source.url,
        method: "GET",
        requestHeaders: source.headers,
        responseStatus: res.status,
        responseBody: text,
        error: message,
      });
    }
    throw new Error(message);
  }

  if (context) {
    await logApiCall({
      skillId: context.skillId,
      fieldKey: context.fieldKey,
      direction: "input",
      kind: "fetch",
      url: source.url,
      method: "GET",
      requestHeaders: source.headers,
      responseStatus: res.status,
      responseBody: text,
    });
  }

  return applyApiFieldMapping(source.mapping, data);
}
