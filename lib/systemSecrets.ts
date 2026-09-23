import type { InputField } from "./types";

// Every name a skill's systemSecrets can reference must live in this
// namespace — enforced again here (not just on save, PATCH /api/skills/[id])
// since a skill definition is editable by anyone with dashboard access, and
// without this a skill's prompt could be pointed at any other server env
// var (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, COWORK_AGENT_TOKEN,
// ...) instead of just a credential meant for this purpose.
const SYSTEM_SECRET_PREFIX = "SKILL_SECRET_";

export type SystemSecretsResolution =
  | { values: Record<string, string>; schema: InputField[] }
  | { error: string };

/**
 * Resolves a skill's Skill.systemSecrets (names of server env vars) fresh
 * from process.env at dispatch time — never cached, never persisted. Each
 * one becomes a synthetic secret-typed input field (key = the env var name
 * with the SKILL_SECRET_ prefix stripped and lowercased) so it flows through
 * lib/mask.ts's existing masking exactly like any other secret input:
 * the real value is only ever used for the one live dispatch call
 * (lib/mask.ts's buildRawPrompt), while promptSnapshot/execution history
 * show the masked placeholder instead — a hardcoded credential this way
 * never touches the database in plain text, matching this app's "no
 * credential in plain text in history or logs" rule for every other kind
 * of secret.
 *
 * A missing env var (declared on the skill, but not actually set in Vercel)
 * is reported as an error rather than silently substituting an empty
 * string, which would otherwise make Cowork try to log in with a blank
 * password instead of stopping — same "surface as pending, don't simulate"
 * rule this app applies to every other missing-configuration case.
 */
export function resolveSystemSecrets(names: string[] | null): SystemSecretsResolution {
  if (!names || names.length === 0) return { values: {}, schema: [] };

  const values: Record<string, string> = {};
  const schema: InputField[] = [];
  const missing: string[] = [];

  for (const name of names) {
    if (!name.startsWith(SYSTEM_SECRET_PREFIX)) continue; // outside the safe namespace — ignored, not trusted
    const value = process.env[name];
    if (!value) {
      missing.push(name);
      continue;
    }
    const key = name.slice(SYSTEM_SECRET_PREFIX.length).toLowerCase();
    values[key] = value;
    schema.push({ key, label: key, type: "secret", required: false });
  }

  if (missing.length > 0) {
    return {
      error:
        `Essa skill espera as variáveis de ambiente ${missing.join(", ")}, mas não estão configuradas — ` +
        `defina no Vercel antes de rodar.`,
    };
  }

  return { values, schema };
}
