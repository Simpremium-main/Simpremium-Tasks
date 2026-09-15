import { createExecution, updateExecution, updateSkill } from "./data";
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
 *
 * The execution row is written as "running" *before* dispatch, then updated
 * to its final state after — not a single insert at the end. Some skills
 * (a full page scrape + file generation, say) can run long enough to hit a
 * platform-level timeout that kills the process outright, with no chance
 * for any try/catch here to run. Writing "running" first means that even
 * then, a row exists showing the attempt happened and got stuck — better
 * than the run vanishing with zero trace.
 */
export async function runSkill(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null
) {
  const execution = await startExecution(skill, inputValues, ranBy);
  const { rawPrompt } = buildPrompts(skill, inputValues);
  const dispatch = skill.usesCowork
    ? await dispatchToCowork(rawPrompt)
    : await dispatchToClaude(rawPrompt);

  return finishExecution(skill, execution.id, dispatch);
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
  const execution = await startExecution(skill, inputValues, ranBy);
  const { rawPrompt } = buildPrompts(skill, inputValues);
  const dispatch = skill.usesCowork
    ? await dispatchToCowork(rawPrompt)
    : await streamDispatchToClaude(rawPrompt, onDelta);

  return finishExecution(skill, execution.id, dispatch);
}

function buildPrompts(skill: Skill, inputValues: Record<string, string>) {
  const schema: InputField[] = skill.inputSchema ?? [];
  return {
    rawPrompt: buildRawPrompt(skill.promptTemplate, inputValues),
    promptSnapshot: buildPromptSnapshot(skill.promptTemplate, inputValues, schema),
    maskedInputs: maskInputValues(inputValues, schema),
  };
}

async function startExecution(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null
) {
  const { promptSnapshot, maskedInputs } = buildPrompts(skill, inputValues);
  return createExecution({
    skillId: skill.id,
    status: "running",
    source: skill.usesCowork ? "cowork" : "claude",
    inputValues: Object.keys(maskedInputs).length ? maskedInputs : null,
    promptSnapshot,
    result: null,
    error: null,
    files: null,
    ranBy,
  });
}

async function finishExecution(skill: Skill, executionId: string, dispatch: DispatchResult) {
  const execution = await updateExecution(executionId, {
    status: dispatch.status,
    result: dispatch.result ?? null,
    error: dispatch.error ?? null,
    files: dispatch.files && dispatch.files.length ? dispatch.files : null,
  });
  if (!execution) {
    // Shouldn't happen — startExecution() just inserted this row — but the
    // update helper's return type is nullable (a generic guard on every
    // updateX(id, patch) in lib/data.ts), so make the impossible case loud
    // instead of silently returning null to the API route.
    throw new Error(`Execution ${executionId} vanished before it could be finished`);
  }

  const updates: { confirmedOnce?: boolean; status?: Skill["status"] } = {};
  if (!skill.confirmedOnce) updates.confirmedOnce = true;
  if (dispatch.status === "success" && skill.status === "draft") updates.status = "active";
  if (Object.keys(updates).length > 0) {
    await updateSkill(skill.id, updates);
  }

  return execution;
}
