import type { TokenUsage } from "./types";

// Claude Sonnet 5 (claude-sonnet-5, the model lib/claude.ts dispatches skill
// runs on) first-party API rates, per million tokens. Not fetched from
// anywhere live — if the model or its price changes, update this constant.
const INPUT_PRICE_PER_MTOK = 2.0;
const OUTPUT_PRICE_PER_MTOK = 10.0;
// Anthropic's standard ephemeral-cache multipliers on the base input rate —
// writing to the cache costs more than a plain call, reading from it costs
// far less, which is the whole point (see lib/claude.ts's cache_control
// usage on the multi-chunk conversation prefix and the system prompt).
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function estimateCostUsd(usage: TokenUsage): number {
  const cacheCreation = usage.cacheCreationInputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  return (
    (usage.inputTokens / 1_000_000) * INPUT_PRICE_PER_MTOK +
    (cacheCreation / 1_000_000) * INPUT_PRICE_PER_MTOK * CACHE_WRITE_MULTIPLIER +
    (cacheRead / 1_000_000) * INPUT_PRICE_PER_MTOK * CACHE_READ_MULTIPLIER +
    (usage.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MTOK
  );
}

/** Every token Anthropic reported for this call, cache reads/writes
 *  included — for a plain "how big was this" total, not the cost math
 *  above (which weighs each kind differently). */
export function totalTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    (usage.cacheCreationInputTokens ?? 0) +
    (usage.cacheReadInputTokens ?? 0)
  );
}

export function sumTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: (a.cacheCreationInputTokens ?? 0) + (b.cacheCreationInputTokens ?? 0),
    cacheReadInputTokens: (a.cacheReadInputTokens ?? 0) + (b.cacheReadInputTokens ?? 0),
  };
}

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  return `${(count / 1000).toFixed(1)}k`;
}

export function formatCostUsd(usd: number): string {
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
