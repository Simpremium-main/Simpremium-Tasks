import { createExecution, updateExecution, updateSkill } from "./data";
import { buildPromptSnapshot, buildRawPrompt, maskInputValues } from "./mask";
import { dispatchToCowork } from "./cowork";
import { dispatchClaudeChunk, dispatchToClaude } from "./claude";
import type { ClaudeChunkResult } from "./claude";
import type {
  ConversationState,
  DispatchResult,
  Execution,
  ExecutionFile,
  InputField,
  Skill,
  TokenUsage,
} from "./types";
import type Anthropic from "@anthropic-ai/sdk";

// Across however many chunks a run takes (each its own HTTP request, see
// continueSkillRun below), give up after this many rather than continuing
// forever — a clean, recorded failure beats an endless "running" row.
const MAX_CHUNKS = 8;

export interface RunStepResult {
  execution: Execution;
  /** false means the run is still going — the caller (the streaming route)
   *  should tell the client to call the continue endpoint again. */
  done: boolean;
}

/**
 * Runs a skill: assembles the prompt from its template + the inputs the
 * user filled in, dispatches it through the right adapter, and records the
 * attempt as an Execution row no matter what happens — success, error, or
 * "needs setup" all get a history entry, per the security baseline that
 * nothing runs silently.
 *
 * The execution row is written as "running" *before* dispatch, then updated
 * as it progresses — not a single insert at the end. A heavy skill (a full
 * page scrape, then generating a file) can run long enough to hit a
 * platform-level timeout that kills the process outright, with no chance
 * for any try/catch here to run — writing "running" first means a row still
 * exists showing the attempt happened, instead of the run vanishing.
 *
 * Claude-direct runs are also split into chunks, each one bounded well
 * under Vercel's per-invocation time limit (see lib/claude.ts's
 * dispatchClaudeChunk): when a chunk ends with Claude's own "pause_turn"
 * (its server-tool loop hit an internal iteration cap), the conversation
 * so far is saved on the execution row and this function returns
 * `done: false` — the run/stream route sends a "continue" event instead of
 * "done", and the run panel calls POST /api/executions/[id]/continue
 * automatically to keep going, as many times as it takes (up to
 * MAX_CHUNKS). Cowork dispatch is a single blocking webhook call with
 * nothing to chunk, so it always finishes in one step.
 */
export async function runSkillStreaming(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null,
  onDelta: (chunk: string) => void
): Promise<RunStepResult> {
  const execution = await startExecution(skill, inputValues, ranBy);

  return withFailureRecorded(skill, execution.id, async () => {
    if (skill.usesCowork) {
      const { rawPrompt } = buildPrompts(skill, inputValues);
      const dispatch = await dispatchToCowork(rawPrompt);
      return { execution: await finishExecution(skill, execution.id, dispatch), done: true };
    }

    const { rawPrompt } = buildPrompts(skill, inputValues);
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: rawPrompt }];
    return advance(skill, execution.id, messages, 0, [], { inputTokens: 0, outputTokens: 0 }, onDelta);
  });
}

/**
 * Guarantees a dispatch attempt always ends with the execution row finalized
 * — status "error" if anything throws here — rather than left at "running"
 * forever. dispatchClaudeChunk already catches its own failures (a bad API
 * call, a file-upload error) and returns a normal error result; this is the
 * backstop for whatever gets past that (e.g. the DB write in finishExecution
 * itself failing) or throws from dispatchToCowork. Without it, the caller
 * (the stream route) only tells the client something went wrong — it never
 * touches the DB row that startExecution() already wrote as "running".
 */
async function withFailureRecorded(
  skill: Skill,
  executionId: string,
  run: () => Promise<RunStepResult>
): Promise<RunStepResult> {
  try {
    return await run();
  } catch (err) {
    const dispatch: DispatchResult = {
      status: "error",
      error: err instanceof Error ? err.message : "Unexpected error running this skill",
    };
    return { execution: await finishExecution(skill, executionId, dispatch), done: true };
  }
}

/**
 * Single-request run, for the plain JSON route (no SSE/continuation) — used
 * by scripts that just want one response. Bounded internally by
 * dispatchToClaude's own small chunk cap, so a task heavy enough to need
 * real multi-request continuation should go through runSkillStreaming (the
 * run panel) instead, not this one.
 */
export async function runSkill(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null
): Promise<Execution> {
  const execution = await startExecution(skill, inputValues, ranBy);
  const { rawPrompt } = buildPrompts(skill, inputValues);
  const dispatch = skill.usesCowork
    ? await dispatchToCowork(rawPrompt)
    : await dispatchToClaude(rawPrompt);

  return finishExecution(skill, execution.id, dispatch);
}

/**
 * Continues an in-progress Claude-direct run from its saved conversation
 * state. Called by POST /api/executions/[id]/continue, itself called
 * automatically by the run panel whenever a chunk comes back `done: false`.
 */
export async function continueSkillRun(
  skill: Skill,
  execution: Execution,
  onDelta: (chunk: string) => void
): Promise<RunStepResult> {
  const state = execution.conversationState;
  if (!state) {
    throw new Error(`Execution ${execution.id} has no saved state to continue from`);
  }
  return withFailureRecorded(skill, execution.id, () =>
    advance(
      skill,
      execution.id,
      state.messages as Anthropic.Beta.BetaMessageParam[],
      state.chunkCount,
      state.files,
      state.usage,
      onDelta
    )
  );
}

async function advance(
  skill: Skill,
  executionId: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  priorChunkCount: number,
  priorFiles: ExecutionFile[],
  priorUsage: TokenUsage,
  onDelta: (chunk: string) => void
): Promise<RunStepResult> {
  const chunkCount = priorChunkCount + 1;

  if (chunkCount > MAX_CHUNKS) {
    const dispatch: DispatchResult = {
      status: "error",
      error: `This task took more than ${MAX_CHUNKS} steps to finish and was stopped rather than run indefinitely.`,
      files: priorFiles,
      usage: priorUsage,
    };
    return { execution: await finishExecution(skill, executionId, dispatch), done: true };
  }

  const chunk: ClaudeChunkResult = await dispatchClaudeChunk(messages, onDelta);
  const files = [...priorFiles, ...chunk.files];
  const usage: TokenUsage = chunk.usage
    ? {
        inputTokens: priorUsage.inputTokens + chunk.usage.inputTokens,
        outputTokens: priorUsage.outputTokens + chunk.usage.outputTokens,
      }
    : priorUsage;

  if (!chunk.done) {
    const state: ConversationState = { messages: chunk.messages, chunkCount, files, usage };
    const execution = await updateExecution(executionId, { conversationState: state });
    if (!execution) throw new Error(`Execution ${executionId} vanished mid-run`);
    return { execution, done: false };
  }

  const dispatch: DispatchResult = {
    status: chunk.status!,
    result: chunk.result,
    error: chunk.error,
    files,
    usage,
  };
  return { execution: await finishExecution(skill, executionId, dispatch), done: true };
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
    conversationState: null,
    usage: dispatch.usage ?? null,
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
