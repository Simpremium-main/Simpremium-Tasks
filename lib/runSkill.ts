import { prisma } from "./db";
import { buildPromptSnapshot, buildRawPrompt, maskInputValues } from "./mask";
import { dispatchToCowork } from "./cowork";
import { dispatchToClaude } from "./claude";
import type { InputField } from "./types";
import type { Skill } from "@prisma/client";

/**
 * Runs a skill: assembles the prompt from its template + the inputs the
 * user filled in, dispatches it through the right adapter, and records the
 * attempt as an Execution row no matter what happens — success, error, or
 * "needs setup" all get a history entry, per the security baseline that
 * nothing runs silently.
 */
export async function runSkill(skill: Skill, inputValues: Record<string, string>) {
  const schema: InputField[] = skill.inputSchema ? JSON.parse(skill.inputSchema) : [];
  const rawPrompt = buildRawPrompt(skill.promptTemplate, inputValues);
  const promptSnapshot = buildPromptSnapshot(skill.promptTemplate, inputValues, schema);
  const maskedInputs = maskInputValues(inputValues, schema);

  const source = skill.usesCowork ? "cowork" : "claude";
  const dispatch = skill.usesCowork
    ? await dispatchToCowork(rawPrompt)
    : await dispatchToClaude(rawPrompt);

  const execution = await prisma.execution.create({
    data: {
      skillId: skill.id,
      status: dispatch.status,
      source,
      inputValues: Object.keys(maskedInputs).length ? JSON.stringify(maskedInputs) : null,
      promptSnapshot,
      result: dispatch.result ?? null,
      error: dispatch.error ?? null,
      finishedAt: new Date(),
    },
  });

  const updates: Record<string, unknown> = {};
  if (!skill.confirmedOnce) updates.confirmedOnce = true;
  if (dispatch.status === "success" && skill.status === "draft") updates.status = "active";
  if (Object.keys(updates).length > 0) {
    await prisma.skill.update({ where: { id: skill.id }, data: updates });
  }

  return execution;
}
