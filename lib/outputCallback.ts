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

/** The one place this app actually sends a real request to someone's
 *  external system as a side effect of a skill finishing — see
 *  lib/runSkill.ts's finishExecution for the only caller. Never used
 *  during setup/preview (components/OutputCallbackModal.tsx only ever
 *  calls buildCallbackBody, never this), so configuring one can't
 *  accidentally create real records in the target system. */
export async function sendOutputCallback(
  callback: OutputCallback,
  resultText: string
): Promise<{ status: number; body: string }> {
  const body = buildCallbackBody(callback, resultText);

  let res: Response;
  try {
    res = await fetch(callback.url, {
      method: callback.method,
      headers: { "Content-Type": "application/json", ...(callback.headers ?? {}) },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Falha ao conectar em "${callback.url}": ${err instanceof Error ? err.message : "erro desconhecido"}`);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`"${callback.url}" respondeu HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, body: text };
}
