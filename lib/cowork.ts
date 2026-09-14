import type { DispatchResult } from "./types";

/**
 * Dispatch to Claude Cowork.
 *
 * There is no fixed, universal way to hand a task to Cowork — the CLAUDE.md
 * for this project is explicit that this integration point should be
 * checked against whatever the current environment actually offers, rather
 * than assumed once and hardcoded. As of this build no Cowork dispatch
 * mechanism (webhook, SDK, MCP tool) is configured or discoverable, so this
 * adapter deliberately does NOT simulate a result. It reports "needs_setup"
 * so the skill is surfaced in the dashboard as pending manual configuration.
 *
 * To wire it up for real once a dispatch mechanism is available: implement
 * the call below (e.g. POST to COWORK_DISPATCH_WEBHOOK_URL, or an SDK/MCP
 * call) and return the real result/error instead of the needs_setup branch.
 */
export async function dispatchToCowork(prompt: string): Promise<DispatchResult> {
  const webhookUrl = process.env.COWORK_DISPATCH_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      status: "needs_setup",
      error:
        "Cowork dispatch isn't configured yet. Set COWORK_DISPATCH_WEBHOOK_URL " +
        "(and COWORK_DISPATCH_TOKEN if needed) once you know how this environment " +
        "exposes Cowork, then this skill will run for real instead of sitting pending.",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.COWORK_DISPATCH_TOKEN
          ? { Authorization: `Bearer ${process.env.COWORK_DISPATCH_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      return {
        status: "error",
        error: `Cowork dispatch failed with HTTP ${response.status}: ${await response.text()}`,
      };
    }

    const data = await response.json();
    return { status: "success", result: typeof data === "string" ? data : JSON.stringify(data) };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error dispatching to Cowork",
    };
  }
}
