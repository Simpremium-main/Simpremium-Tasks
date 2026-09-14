import { createExecution, updateSkill } from "./data";
import { buildPromptSnapshot, buildRawPrompt, maskInputValues } from "./mask";
import { dispatchToCowork } from "./cowork";
import { dispatchToClaude } from "./claude";
import type { InputField, Skill } from "./types";

/**
 * Runs a skill: assembles the prompt from its template + the inputs the
 * user filled in, dispatches it through the right adapter, and records the
 * attempt as an Execution row no matter what happens — success, error, or
 * "needs setup" all get a history entry, per the security baseline that
 * nothing runs silently.
 */
export async function runSkill(skill: Skill, inputValues: Record<string, string>) {
  const schema: InputField[] = skill.inputSchema ?? [];
  const rawPrompt = buildRawPrompt(skill.promptTemplate, inputValues);
  const promptSnapshot = buildPromptSnapshot(skill.promptTemplate, inputValues, schema);
  const maskedInputs = maskInputValues(inputValues, schema);

  const source = skill.usesCowork ? "cowork" : "claude";
  const dispatch = skill.usesCowork
    ? await dispatchToCowork(rawPrompt)
    : await dispatchToClaude(rawPrompt);

  const execution = await createExecution({
    skillId: skill.id,
    status: dispatch.status,
    source,
    inputValues: Object.keys(maskedInputs).length ? maskedInputs : null,
    promptSnapshot,
    result: dispatch.result ?? null,
    error: dispatch.error ?? null,
  });

  const updates: { confirmedOnce?: boolean; status?: Skill["status"] } = {};
  if (!skill.confirmedOnce) updates.confirmedOnce = true;
  if (dispatch.status === "success" && skill.status === "draft") updates.status = "active";
  if (Object.keys(updates).length > 0) {
    await updateSkill(skill.id, updates);
  }

  return execution;
}
