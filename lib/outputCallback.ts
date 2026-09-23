import { logApiCall } from "./apiCallLog";
import { parseMarkdownTable } from "./resultTable";
import type { OutputCallback } from "./types";

/**
 * Builds the exact JSON body an execution's own result table maps to,
 * without ever string-templating raw JSON — every value goes through a
 * real object + JSON.stringify (in sendOutputCallback), so a value
 * containing a `"` or newline can't produce broken JSON the way filling a
 * '{"x": "{header}"}'-style text template would.
 */
export function buildCallbackBody(callback: OutputCallback, resultText: string): unknown {
  const rows = parseMarkdownTable(resultText);
  if (!rows || rows.length === 0) {
    throw new Error("Não encontrei uma tabela markdown no resultado pra montar o retorno da API.");
  }

  const items = rows.map((row) => {
    const item: Record<string, string> = {};
    for (const { targetKey, sourceHeader } of callback.itemFieldMap) {
      item[targetKey] = row[sourceHeader] ?? "";
    }
    return item;
  });

  if (!callback.itemsPath) return items;

  const parts = callback.itemsPath.split(".").filter(Boolean);
  const body: Record<string, unknown> = {};
  let cursor = body;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Record<string, unknown> = {};
    cursor[parts[i]] = next;
    cursor = next;
  }
  cursor[parts[parts.length - 1] ?? "items"] = items;
  return body;
}

/** A plain-language summary of what a saved callback actually sends —
 *  shown in components/OutputCallbackModal.tsx when reopening one that's
 *  already configured, so what's saved is visible without re-testing
 *  (which would otherwise be the only way to see it, and re-calls Claude
 *  for no reason). */
export function describeOutputCallback(callback: OutputCallback): string[] {
  const lines = callback.itemFieldMap.map(({ targetKey, sourceHeader }) => `${sourceHeader} → ${targetKey}`);
  lines.push(
    callback.itemsPath
      ? `A lista de itens vai no campo "${callback.itemsPath}" do corpo enviado.`
      : "A lista de itens é o corpo inteiro da requisição."
  );
  return lines;
}

/** The one place this app actually sends a real request to someone's
 *  external system as a side effect of a skill finishing — see
 *  lib/runSkill.ts's finishExecution for the only caller. Never used
 *  during setup/preview (components/OutputCallbackModal.tsx only ever
 *  calls buildCallbackBody, never this), so configuring one can't
 *  accidentally create real records in the target system. */
export async function sendOutputCallback(
  callback: OutputCallback,
  resultText: string,
  // Only for app/(app)/api-logs — logs every real send against the skill
  // that triggered it, success or failure.
  skillId: string | null
): Promise<{ status: number; body: string }> {
  const body = buildCallbackBody(callback, resultText);
  const bodyText = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(callback.url, {
      method: callback.method,
      headers: { "Content-Type": "application/json", ...(callback.headers ?? {}) },
      body: bodyText,
    });
  } catch (err) {
    const message = `Falha ao conectar em "${callback.url}": ${err instanceof Error ? err.message : "erro desconhecido"}`;
    await logApiCall({
      skillId,
      direction: "output",
      kind: "send",
      url: callback.url,
      method: callback.method,
      requestHeaders: callback.headers,
      requestBody: bodyText,
      error: message,
    });
    throw new Error(message);
  }

  const text = await res.text();
  if (!res.ok) {
    const message = `"${callback.url}" respondeu HTTP ${res.status}: ${text.slice(0, 300)}`;
    await logApiCall({
      skillId,
      direction: "output",
      kind: "send",
      url: callback.url,
      method: callback.method,
      requestHeaders: callback.headers,
      requestBody: bodyText,
      responseStatus: res.status,
      responseBody: text,
      error: message,
    });
    throw new Error(message);
  }

  await logApiCall({
    skillId,
    direction: "output",
    kind: "send",
    url: callback.url,
    method: callback.method,
    requestHeaders: callback.headers,
    requestBody: bodyText,
    responseStatus: res.status,
    responseBody: text,
  });

  return { status: res.status, body: text };
}
