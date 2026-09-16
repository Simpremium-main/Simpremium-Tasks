import type { TokenUsage } from "./types";

// Claude Sonnet 5 (claude-sonnet-5, the model lib/claude.ts dispatches skill
// runs on) first-party API rates, per million tokens. Not fetched from
// anywhere live — if the model or its price changes, update this constant.
const INPUT_PRICE_PER_MTOK = 2.0;
const OUTPUT_PRICE_PER_MTOK = 10.0;

export function estimateCostUsd(usage: TokenUsage): number {
  return (
    (usage.inputTokens / 1_000_000) * INPUT_PRICE_PER_MTOK +
    (usage.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MTOK
  );
}

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  return `${(count / 1000).toFixed(1)}k`;
}

export function formatCostUsd(usd: number): string {
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
