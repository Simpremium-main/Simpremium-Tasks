import type { InputField } from "./types";

const SECRET_KEY_HINTS = ["token", "key", "secret", "password", "senha", "credential", "apikey"];

export function looksLikeSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_HINTS.some((hint) => lower.includes(hint));
}

/** Keeps the shape recognizable (last 4 chars) without exposing the value. */
export function maskValue(value: string): string {
  if (!value) return value;
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
}

/**
 * Masks any value whose field is typed "secret" (or whose key name looks
 * secret-ish, as a safety net for freeform templates) before it is ever
 * written to execution history or shown in a run summary.
 */
export function maskInputValues(
  values: Record<string, string>,
  schema: InputField[]
): Record<string, string> {
  const secretKeys = new Set(
    schema.filter((f) => f.type === "secret").map((f) => f.key)
  );
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    masked[key] = secretKeys.has(key) || looksLikeSecretKey(key) ? maskValue(value) : value;
  }
  return masked;
}

/**
 * Builds the final prompt from a template with {{key}} placeholders, but
 * masks secret fields in the version that gets persisted/displayed — the
 * raw prompt (with real secret values) is only ever held in memory for the
 * single dispatch call and never written to the database.
 */
export function buildPromptSnapshot(
  template: string,
  values: Record<string, string>,
  schema: InputField[]
): string {
  const masked = maskInputValues(values, schema);
  return fillTemplate(template, masked);
}

export function buildRawPrompt(
  template: string,
  values: Record<string, string>
): string {
  return fillTemplate(template, values);
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    return key in values ? values[key] : match;
  });
}
