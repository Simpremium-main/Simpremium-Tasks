import Anthropic from "@anthropic-ai/sdk";
import type { DispatchResult } from "./types";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Runs a skill's assembled prompt directly against the Claude API. Used for
 * skills that don't depend on Cowork. Never fabricates a result: if no API
 * key is configured, it reports "needs_setup" instead.
 */
export async function dispatchToClaude(prompt: string): Promise<DispatchResult> {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      status: "needs_setup",
      error: "ANTHROPIC_API_KEY isn't set, so this skill can't be run yet. Add it to your environment to enable it.",
    };
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return { status: "success", result: text };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error calling Claude",
    };
  }
}
