import { createExecution, updateSkill } from "./data";
import { buildPromptSnapshot, buildRawPrompt, maskInputValues } from "./mask";
import { dispatchToCowork } from "./cowork";
import { dispatchToClaude, streamDispatchToClaude } from "./claude";
import type { DispatchResult, InputField, Skill } from "./types";

/**
 * Runs a skill: assembles the prompt from its template + the inputs the
 * user filled in, dispatches it through the right adapter, and records the
 * attempt as an Execution row no matter what happens — success, error, or
 * "needs setup" all get a history entry, per the security baseline that
 * nothing runs silently.
 */
export async function runSkill(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null
) {
  const { rawPrompt } = buildPrompts(skill, inputValues);
  const dispatch = skill.usesCowork
    ? await dispatchToCowork(rawPrompt)
    : await dispatchToClaude(rawPrompt);

  return recordDispatch(skill, inputValues, ranBy, dispatch);
}

/**
 * Same as runSkill, but for Claude-direct skills it streams the response
 * text as it arrives via onDelta, so the run panel can show it building up
 * live ("Pensando...") instead of a blank spinner until the whole answer
 * lands. Cowork skills have no streaming dispatch mechanism (it's a single
 * webhook call, still needs_setup until COWORK_DISPATCH_WEBHOOK_URL is
 * configured), so they fall back to the same one-shot dispatch as runSkill —
 * onDelta just never fires for them.
 */
export async function runSkillStreaming(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null,
  onDelta: (chunk: string) => void
) {
  const { rawPrompt } = buildPrompts(skill, inputValues);
  const dispatch = skill.usesCowork
    ? await dispatchToCowork(rawPrompt)
    : await streamDispatchToClaude(rawPrompt, onDelta);

  return recordDispatch(skill, inputValues, ranBy, dispatch);
}

function buildPrompts(skill: Skill, inputValues: Record<string, string>) {
  const schema: InputField[] = skill.inputSchema ?? [];
  return {
    rawPrompt: buildRawPrompt(skill.promptTemplate, inputValues),
    promptSnapshot: buildPromptSnapshot(skill.promptTemplate, inputValues, schema),
    maskedInputs: maskInputValues(inputValues, schema),
  };
}

async function recordDispatch(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null,
  dispatch: DispatchResult
) {
  const { promptSnapshot, maskedInputs } = buildPrompts(skill, inputValues);
  const source = skill.usesCowork ? "cowork" : "claude";

  const execution = await createExecution({
    skillId: skill.id,
    status: dispatch.status,
    source,
    inputValues: Object.keys(maskedInputs).length ? maskedInputs : null,
    promptSnapshot,
    result: dispatch.result ?? null,
    error: dispatch.error ?? null,
    ranBy,
  });

  const updates: { confirmedOnce?: boolean; status?: Skill["status"] } = {};
  if (!skill.confirmedOnce) updates.confirmedOnce = true;
  if (dispatch.status === "success" && skill.status === "draft") updates.status = "active";
  if (Object.keys(updates).length > 0) {
    await updateSkill(skill.id, updates);
  }

  return execution;
}
