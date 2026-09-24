import { createExecution, setCoworkPayload, updateExecution, updateSkill } from "./data";
import { splitLinesByAccountGroups } from "./accountSplit";
import { buildPromptSnapshot, buildRawPrompt, maskInputValues } from "./mask";
import { isCoworkAgentConfigured } from "./cowork";
import { dispatchClaudeChunk, dispatchToClaude } from "./claude";
import type { ClaudeChunkResult } from "./claude";
import { sumTokenUsage } from "./cost";
import { transcribeVideoUrl } from "./transcribe";
import { buildCallbackBody, sendOutputCallback } from "./outputCallback";
import { findUnconfiguredPlaceholders, resolveSystemSecrets } from "./systemSecrets";
import type {
  ConversationState,
  DispatchResult,
  Execution,
  ExecutionFile,
  InputField,
  OutputCallbackResult,
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
 * MAX_CHUNKS). Cowork dispatch doesn't chunk at all — it queues the job
 * (see queueForCowork below) and returns immediately, "running" until the
 * Mac mini agent reports a real result back asynchronously.
 */
export async function runSkillStreaming(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null,
  onDelta: (chunk: string) => void,
  dryRun?: boolean
): Promise<RunStepResult> {
  const execution = await startExecution(skill, inputValues, ranBy, undefined, dryRun);

  return withFailureRecorded(skill, execution.id, async () => {
    const resolved = await resolveInputValues(skill, inputValues);
    if ("error" in resolved) {
      return { execution: await finishExecution(skill, execution.id, resolved.error), done: true };
    }
    const values = resolved.values;

    if (skill.usesCowork) {
      const { rawPrompt } = buildPrompts(skill, values);
      const needsSetup = await queueForCowork(execution.id, rawPrompt);
      if (needsSetup) {
        return { execution: await finishExecution(skill, execution.id, needsSetup), done: true };
      }
      // Queued, not finished — the row stays "running" for the Mac mini
      // agent to pick up asynchronously (see lib/cowork.ts). This HTTP
      // request has nothing left to wait for.
      return { execution, done: true };
    }

    const { rawPrompt } = buildPrompts(skill, values);
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: rawPrompt }];
    return advance(skill, execution.id, messages, 0, [], { inputTokens: 0, outputTokens: 0 }, onDelta);
  });
}

const COWORK_NEEDS_SETUP_MESSAGE =
  "Nenhum agente Cowork está configurado ainda — defina COWORK_AGENT_TOKEN nas variáveis de " +
  "ambiente e rode o agente no seu Mac mini (veja mac-agent/README.md) pra essa skill rodar de " +
  "verdade, em vez de ficar pendente.";

/**
 * Queues a Cowork skill's run instead of dispatching it directly (see
 * lib/cowork.ts for the whole async design): stores the real, unmasked
 * prompt on the execution row for the Mac mini agent to pick up later, and
 * leaves the row "running". Returns a DispatchResult only when there's
 * genuinely nothing to queue into — no agent configured at all — so the
 * caller can finish the row as "needs_setup" instead of leaving it running
 * forever with nothing coming to collect it; returns null on the normal
 * "queued successfully" path.
 */
async function queueForCowork(executionId: string, rawPrompt: string): Promise<DispatchResult | null> {
  console.log(`[cowork-agent-server] queueForCowork called for execution ${executionId} (prompt length ${rawPrompt.length})`);
  if (!isCoworkAgentConfigured()) {
    console.log(`[cowork-agent-server] queueForCowork: no agent configured, marking execution ${executionId} as needs_setup instead of queuing`);
    return { status: "needs_setup", error: COWORK_NEEDS_SETUP_MESSAGE };
  }
  await setCoworkPayload(executionId, rawPrompt);
  console.log(`[cowork-agent-server] queueForCowork: payload stored, execution ${executionId} left "running" for the agent to claim`);
  return null;
}

/**
 * Guarantees a dispatch attempt always ends with the execution row finalized
 * — status "error" if anything throws here — rather than left at "running"
 * forever. dispatchClaudeChunk already catches its own failures (a bad API
 * call, a file-upload error) and returns a normal error result; this is the
 * backstop for whatever gets past that (e.g. the DB write in finishExecution
 * itself failing, or setCoworkPayload throwing). Without it, the caller
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
  ranBy: string | null,
  sourceOverride?: Execution["source"],
  dryRun?: boolean,
  accountTag?: { label: string; chromeProfile: string }
): Promise<Execution> {
  const execution = await startExecution(skill, inputValues, ranBy, sourceOverride, dryRun, accountTag);

  const resolved = await resolveInputValues(skill, inputValues);
  if ("error" in resolved) {
    return finishExecution(skill, execution.id, resolved.error);
  }

  const { rawPrompt } = buildPrompts(skill, resolved.values);

  if (skill.usesCowork) {
    const needsSetup = await queueForCowork(execution.id, rawPrompt);
    return needsSetup ? finishExecution(skill, execution.id, needsSetup) : execution;
  }

  const dispatch = await dispatchToClaude(rawPrompt);
  return finishExecution(skill, execution.id, dispatch);
}

/**
 * The entry point POST /api/skills/[id]/run actually calls — wraps runSkill
 * with Skill.accountSplit: when set (Cowork-only), and the designated
 * field's rows cleanly belong to more than one account, this runs one
 * separate execution PER account instead of one execution for everything,
 * so the Mac mini agent never has to switch which TIM (or whatever
 * portal's) account is logged in mid-task — see lib/accountSplit.ts and
 * README's "Multi-account Cowork skills" section for the full story.
 * Every other skill (accountSplit null, the default) behaves exactly as
 * runSkill always has — this always returns a 1-element array for those.
 */
export async function runSkillMaybeSplit(
  skill: Skill,
  inputValues: Record<string, string>,
  ranBy: string | null,
  sourceOverride?: Execution["source"],
  dryRun?: boolean
): Promise<Execution[]> {
  if (!skill.usesCowork || !skill.accountSplit) {
    return [await runSkill(skill, inputValues, ranBy, sourceOverride, dryRun)];
  }

  const fieldValue = inputValues[skill.accountSplit.field];
  const groups = typeof fieldValue === "string" ? splitLinesByAccountGroups(fieldValue, skill.accountSplit) : null;
  if (!groups) {
    return [await runSkill(skill, inputValues, ranBy, sourceOverride, dryRun)];
  }

  const executions: Execution[] = [];
  for (const group of groups) {
    const groupInputValues = { ...inputValues, [skill.accountSplit.field]: group.lines.join("\n") };
    executions.push(
      await runSkill(skill, groupInputValues, ranBy, sourceOverride, dryRun, {
        label: group.label,
        chromeProfile: group.chromeProfileDirectory,
      })
    );
  }
  return executions;
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
  const usage: TokenUsage = chunk.usage ? sumTokenUsage(priorUsage, chunk.usage) : priorUsage;

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

/**
 * Resolves everything that needs to happen between "what the person typed"
 * and "what actually goes in the prompt": every "video"-typed field's raw
 * URL swapped for its transcript, and any Skill.systemSecrets merged in
 * from their server env vars (lib/systemSecrets.ts) — a fixed, hardcoded
 * credential the skill's prompt references by placeholder, never typed by
 * the person and never touching the database (the "running" row's
 * promptSnapshot was already written by startExecution *before* this runs,
 * from the raw, unresolved inputValues, so those placeholders are simply
 * still unfilled text there — never the real secret value).
 *
 * Runs after startExecution (so the "running" row already exists — the
 * security baseline that even a failed attempt gets recorded holds here
 * too) but before any dispatch, so a resolution failure (transcription, or
 * a system secret's env var not actually set) finishes the row immediately
 * with a clear reason instead of ever reaching Claude/Cowork.
 */
async function resolveInputValues(
  skill: Skill,
  inputValues: Record<string, string>
): Promise<{ values: Record<string, string> } | { error: DispatchResult }> {
  // Catches the case that quietly broke a real run: a prompt referencing
  // {{tim_login_mundo}}-style placeholder that isn't an inputSchema field
  // AND isn't declared in systemSecrets either — a typo, or forgetting to
  // actually save the "Segredos do sistema" list after setting the env var
  // in Vercel. Without this, fillTemplate (lib/mask.ts) just leaves an
  // unresolved {{...}} untouched — no error, nothing to notice — and that
  // literal text is exactly what gets typed into whatever form it hits.
  // A placeholder for a known inputSchema field left blank (optional field,
  // never touched) is NOT flagged — that's existing, expected behavior.
  const unconfigured = findUnconfiguredPlaceholders(skill.promptTemplate, skill.inputSchema, skill.systemSecrets);
  if (unconfigured.length > 0) {
    return {
      error: {
        status: "needs_setup",
        error:
          `O prompt usa ${unconfigured.map((k) => `{{${k}}}`).join(", ")}, que não é nem um campo de ` +
          `input nem um segredo do sistema configurado nessa skill — adicione o campo em "Campos de ` +
          `input", ou a variável em "Segredos do sistema" (Editar da skill), ou corrija o nome no prompt.`,
      },
    };
  }

  let resolved = { ...inputValues };

  const videoFields = (skill.inputSchema ?? []).filter((f) => f.type === "video");
  for (const field of videoFields) {
    const url = inputValues[field.key]?.trim();
    if (!url) continue; // optional field left blank, or already validated as required upstream

    const result = await transcribeVideoUrl(url);
    if (result.status !== "success" || !result.transcript) {
      return {
        error: {
          status: result.status === "needs_setup" ? "needs_setup" : "error",
          error: result.error ?? "Falha ao transcrever o vídeo.",
        },
      };
    }
    resolved[field.key] = result.transcript;
  }

  const secrets = resolveSystemSecrets(skill.systemSecrets);
  if ("error" in secrets) {
    return { error: { status: "needs_setup", error: secrets.error } };
  }
  resolved = { ...resolved, ...secrets.values };

  return { values: resolved };
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
  ranBy: string | null,
  sourceOverride?: Execution["source"],
  dryRun?: boolean,
  accountTag?: { label: string; chromeProfile: string }
) {
  const { promptSnapshot, maskedInputs } = buildPrompts(skill, inputValues);
  return createExecution({
    skillId: skill.id,
    status: "running",
    source: sourceOverride ?? (skill.usesCowork ? "cowork" : "claude"),
    inputValues: Object.keys(maskedInputs).length ? maskedInputs : null,
    promptSnapshot,
    result: null,
    error: null,
    files: null,
    ranBy,
    dryRun,
    coworkAccountLabel: accountTag?.label ?? null,
    coworkChromeProfile: accountTag?.chromeProfile ?? null,
  });
}

/** Exported for POST /api/cowork-agent/report-result — the Mac mini
 *  agent's reported outcome is finalized through this exact same path
 *  every other dispatch (Claude-direct, scheduled) uses, so a Cowork
 *  result gets the same confirmedOnce/draft→active promotion behavior as
 *  any other successful first run. */
export async function finishExecution(skill: Skill, executionId: string, dispatch: DispatchResult) {
  const execution = await updateExecution(executionId, {
    status: dispatch.status,
    result: dispatch.result ?? null,
    error: dispatch.error ?? null,
    files: dispatch.files && dispatch.files.length ? dispatch.files : null,
    steps: dispatch.steps && dispatch.steps.length ? dispatch.steps : null,
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

  // Fires on every successful run of a skill that has any configured, any
  // source — this is the one shared path every dispatch funnels through
  // (direct return here, POST /api/mcp, POST /api/cowork-agent/report-result,
  // the cron route), so there's exactly one place this needs to be wired in.
  // A skill can fan the same result out to more than one destination — each
  // is attempted independently, so one failing doesn't stop the others.
  // Never blocks/fails the execution's own recorded outcome: the skill run
  // itself already succeeded by the time this runs, so a callback failure
  // is its own separate, visible fact (outputCallbackResults on the row),
  // not a reason to flip the execution to "error" after the fact.
  if (skill.outputCallbacks && skill.outputCallbacks.length > 0 && dispatch.status === "success" && execution.result) {
    const resultText = execution.result;
    const results: OutputCallbackResult[] = [];

    for (const callback of skill.outputCallbacks) {
      // Built once regardless of dry-run, so both branches below can record
      // exactly what was (or would have been) sent — never just a bare
      // status with nothing to actually look at.
      let bodyText: string | null = null;
      try {
        bodyText = JSON.stringify(buildCallbackBody(callback, resultText), null, 2);
      } catch {
        // buildCallbackBody's own error surfaces below either way (from
        // sendOutputCallback re-deriving it, or directly in the dry-run
        // branch) — bodyText just stays null here.
      }

      if (execution.dryRun) {
        // The skill itself already ran for real — this only skips the one
        // side effect that would touch someone else's system, per the
        // "test the real chain without risking a real send" ask.
        let dryRunError: string | null = null;
        if (bodyText === null) {
          try {
            buildCallbackBody(callback, resultText);
          } catch (err) {
            dryRunError = err instanceof Error ? err.message : "Erro desconhecido ao montar o corpo";
          }
        }
        results.push({ url: callback.url, status: dryRunError ? "failed" : "skipped", error: dryRunError, lastBody: bodyText });
        continue;
      }

      try {
        await sendOutputCallback(callback, resultText, skill.id);
        results.push({ url: callback.url, status: "sent", error: null, lastBody: bodyText });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro desconhecido ao enviar o retorno";
        console.error(`finishExecution: output callback failed for execution ${executionId} (${callback.url}):`, err);
        results.push({ url: callback.url, status: "failed", error: message, lastBody: bodyText });
      }
    }

    return (await updateExecution(executionId, { outputCallbackResults: results })) ?? execution;
  }

  return execution;
}
