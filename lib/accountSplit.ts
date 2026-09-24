import type { SkillAccountSplit } from "./types";

export interface AccountSplitGroup {
  label: string;
  lines: string[];
}

/**
 * Splits a multi-line input value into per-account groups, matching each
 * line against `split.groups` in order (first match wins) — see
 * SkillAccountSplit's own doc comment for the full reasoning. Returns null
 * (meaning: don't split, run as a single execution like before this
 * feature existed) whenever the split isn't clean: fewer than two groups
 * actually matched, or any line matched no group at all. That second case
 * deliberately doesn't try to guess or drop the unmatched line — falling
 * back to one execution means the skill's own prompt (which already has
 * its own "linha não bate com nenhuma conta, pare e explique" instruction)
 * is the one that handles it, exactly as it did before this feature
 * existed, rather than this code silently discarding a row or inventing
 * which account it belongs to.
 */
export function splitLinesByAccountGroups(
  text: string,
  split: SkillAccountSplit
): AccountSplitGroup[] | null {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  const compiled = split.groups.map((group) => ({
    group,
    regex: safeRegex(group.pattern),
  }));

  const buckets = new Map<number, string[]>();
  for (const line of lines) {
    const matchIndex = compiled.findIndex(({ regex }) => regex?.test(line));
    if (matchIndex === -1) return null;
    const bucket = buckets.get(matchIndex) ?? [];
    bucket.push(line);
    buckets.set(matchIndex, bucket);
  }

  if (buckets.size < 2) return null;

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, groupLines]) => ({
      label: compiled[index].group.label,
      lines: groupLines,
    }));
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    // Already validated on save (app/api/skills/[id]/route.ts) — this is
    // just a last-resort guard so a bad pattern can't crash a run, only
    // fail to match (which falls back to the unsplit single execution).
    return null;
  }
}
