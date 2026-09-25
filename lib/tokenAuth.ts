import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison for bearer-token auth (the Mac mini
 * agent's COWORK_AGENT_TOKEN, and CRON_SECRET) — every one of these routes
 * is reachable without a logged-in session (middleware.ts explicitly
 * excludes them so the agent/cron caller, which isn't a browser, can reach
 * them at all), so a plain `===` comparison's early-exit-on-first-mismatch
 * timing is a real, if narrow, side channel an attacker could use to
 * recover the token byte-by-byte instead of needing to guess it whole.
 * timingSafeEqual() requires equal-length buffers (throws otherwise) — a
 * length mismatch is treated as an immediate, safe "not equal" rather than
 * padding to compare, since token length isn't the sensitive part.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
