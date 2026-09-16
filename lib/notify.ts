import type { Execution, Skill } from "./types";

/**
 * Best-effort alert for a scheduled run that failed — a scheduled run has
 * nobody watching when it happens, unlike a manual one where the person
 * sees the error immediately (see ExecutionList.tsx's "falhou sozinha"
 * badge for the same reasoning). Sends a Slack-compatible {text} payload,
 * so a Slack "Incoming Webhook" URL works as-is; any other endpoint that
 * accepts that shape works too.
 *
 * Never throws: a broken notification must not fail the scheduled run
 * itself, which is already recorded in execution history regardless.
 */
export async function notifyScheduleFailure(skill: Skill, execution: Execution): Promise<void> {
  const webhookUrl = process.env.SCHEDULE_FAILURE_WEBHOOK_URL;
  if (!webhookUrl) return;

  const reason = execution.error ?? "Sem detalhes do erro.";
  const text =
    `⚠️ Skill Hub: a execução agendada de *${skill.name}* falhou (${execution.status}).\n${reason}`;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      console.error(`notifyScheduleFailure: webhook responded HTTP ${response.status}`);
    }
  } catch (err) {
    console.error("notifyScheduleFailure: failed to send alert", err);
  }
}
