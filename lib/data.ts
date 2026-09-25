import { randomUUID } from "crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient";
import { sumTokenUsage } from "./cost";
import type {
  ApiCallLog,
  ApiFieldSource,
  ConversationState,
  Execution,
  ExecutionFile,
  ExecutionStatus,
  ExecutionSource,
  InputField,
  OutputCallback,
  OutputCallbackResult,
  PromptVersion,
  Skill,
  SkillAccountSplit,
  SkillSchedule,
  TokenUsage,
} from "./types";

// Supabase's client can return an error with an empty `.message` when the
// request never reached Supabase at all (e.g. blocked by a network policy
// before the TLS handshake, or the tables from supabase/schema.sql haven't
// been created yet) — fall back to the HTTP status so the thrown error is
// still useful instead of a blank string.
function describeError(
  context: string,
  error: PostgrestError,
  status?: number,
  statusText?: string
): Error {
  const detail = error.message || `HTTP ${status ?? "?"} ${statusText ?? ""}`.trim();
  return new Error(`${context}: ${detail}`);
}

/**
 * Data layer — every page and API route goes through these functions for
 * persistence, never touching Supabase directly. That seam is what made
 * the earlier mock-data stage possible, and now makes it easy to see
 * exactly what changed to connect the real thing: this file's internals,
 * nothing else. See supabase/schema.sql for the table definitions these
 * functions read and write.
 */

// A skill saved before scheduleApiSources became "one-or-more sources per
// field" still has the old shape in the DB — a single ApiFieldSource object
// per field key, not an array. Reading it as an array (every consumer now
// assumes) would crash the first .map()/for-of over it. Self-heals on read
// so no manual data migration is needed; the next real save (ScheduleModal)
// writes it back out in the new array shape anyway.
function normalizeApiSources(raw: unknown): Record<string, ApiFieldSource[]> | null {
  if (!raw || typeof raw !== "object") return null;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([key, value]) => [
      key,
      Array.isArray(value) ? (value as ApiFieldSource[]) : value ? [value as ApiFieldSource] : [],
    ])
  );
}

function mapSkillRow(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    status: row.status as Skill["status"],
    needsInput: Boolean(row.needs_input),
    usesCowork: Boolean(row.uses_cowork),
    promptTemplate: row.prompt_template as string,
    inputSchema: (row.input_schema as InputField[] | null) ?? null,
    sourcePost: (row.source_post as string | null) ?? null,
    confirmedOnce: Boolean(row.confirmed_once),
    group: (row.group as string | null) ?? null,
    tags: (row.tags as string[] | null) ?? [],
    schedule: (row.schedule as SkillSchedule | null) ?? null,
    scheduleInputValues: (row.schedule_input_values as Record<string, string> | null) ?? null,
    scheduleApiSources: normalizeApiSources(row.schedule_api_sources),
    scheduleLastRunAt: row.schedule_last_run_at ? new Date(row.schedule_last_run_at as string) : null,
    // Same self-heal for the old single-object output_callback column — a
    // skill saved before the fan-out change still only has that one, not
    // the new output_callbacks array (which the SQL migration in the
    // README backfills, but this makes it work immediately either way).
    outputCallbacks:
      (row.output_callbacks as OutputCallback[] | null) ??
      (row.output_callback ? [row.output_callback as OutputCallback] : null),
    pinned: Boolean(row.pinned),
    shareToken: (row.share_token as string | null) ?? null,
    systemSecrets: (row.system_secrets as string[] | null) ?? null,
    accountSplit: (row.account_split as SkillAccountSplit | null) ?? null,
    position: Number(row.position ?? 0),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapExecutionRow(row: Record<string, unknown>): Execution {
  return {
    id: row.id as string,
    skillId: row.skill_id as string,
    status: row.status as ExecutionStatus,
    source: row.source as ExecutionSource,
    inputValues: (row.input_values as Record<string, string> | null) ?? null,
    promptSnapshot: row.prompt_snapshot as string,
    result: (row.result as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    files: (row.files as ExecutionFile[] | null) ?? null,
    steps: (row.steps as string[] | null) ?? null,
    conversationState: (row.conversation_state as ConversationState | null) ?? null,
    usage: (row.usage as TokenUsage | null) ?? null,
    ranBy: (row.ran_by as string | null) ?? null,
    favorite: Boolean(row.favorite),
    archived: Boolean(row.archived),
    coworkStartedAt: row.cowork_started_at ? new Date(row.cowork_started_at as string) : null,
    outputCallbackResults: (row.output_callback_results as OutputCallbackResult[] | null) ?? null,
    dryRun: Boolean(row.dry_run),
    coworkAccountLabel: (row.cowork_account_label as string | null) ?? null,
    coworkClaudeInstance: (row.cowork_claude_instance as string | null) ?? null,
    startedAt: new Date(row.started_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
  };
}

function mapPromptVersionRow(row: Record<string, unknown>): PromptVersion {
  return {
    id: row.id as string,
    skillId: row.skill_id as string,
    promptTemplate: row.prompt_template as string,
    changedBy: (row.changed_by as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

// NOT wrapped in React's cache() on purpose: cache() only memoizes within a
// single RSC render pass, but this function is also called directly from a
// Route Handler (app/api/skills/route.ts) — and on a warm serverless
// instance that memoized result can leak across separate requests, which is
// what caused the dashboard to get stuck showing only the first-ever
// listSkills() result instead of real data. Keep this a plain function.
export async function listSkills(): Promise<
  (Skill & { _count: { executions: number } })[]
> {
  const supabase = getSupabase();

  const {
    data: skillRows,
    error,
    status,
    statusText,
  } = await supabase.from("skills").select("*").order("position", { ascending: true });
  if (error) throw describeError("listSkills", error, status, statusText);

  const {
    data: execRows,
    error: execError,
    status: execStatus,
    statusText: execStatusText,
  } = await supabase.from("executions").select("skill_id");
  if (execError) throw describeError("listSkills (execution counts)", execError, execStatus, execStatusText);

  const counts = new Map<string, number>();
  for (const row of execRows ?? []) {
    const id = row.skill_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (skillRows ?? []).map((row) => ({
    ...mapSkillRow(row),
    _count: { executions: counts.get(row.id as string) ?? 0 },
  }));
}

/** Every skill with an active schedule — GET /api/cron/run-scheduled's
 *  input, checked against lib/schedule.ts's isDue() per skill. */
export async function listScheduledSkills(): Promise<Skill[]> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .select("*")
    .not("schedule", "is", null);
  if (error) throw describeError("listScheduledSkills", error, status, statusText);
  return (data ?? []).map(mapSkillRow);
}

/** Same set as listScheduledSkills, but for the "Agendamentos" overview
 *  page (a person reading it, not the cron route) — each skill paired with
 *  its own most recent *scheduled* execution (if any), so the page can show
 *  whether the automation itself is actually working without opening every
 *  skill individually. */
export async function listScheduledSkillsOverview(): Promise<
  (Skill & { lastScheduledRun: Execution | null })[]
> {
  const supabase = getSupabase();
  const {
    data: skillRows,
    error,
    status,
    statusText,
  } = await supabase.from("skills").select("*").not("schedule", "is", null).order("name");
  if (error) throw describeError("listScheduledSkillsOverview", error, status, statusText);

  const skills = (skillRows ?? []).map(mapSkillRow);
  if (skills.length === 0) return [];

  const {
    data: execRows,
    error: execError,
    status: execStatus,
    statusText: execStatusText,
  } = await supabase
    .from("executions")
    .select("*")
    .in(
      "skill_id",
      skills.map((s) => s.id)
    )
    .eq("source", "scheduled")
    .order("started_at", { ascending: false });
  if (execError) {
    throw describeError("listScheduledSkillsOverview (executions)", execError, execStatus, execStatusText);
  }

  const latestBySkill = new Map<string, Execution>();
  for (const row of execRows ?? []) {
    const skillId = row.skill_id as string;
    if (!latestBySkill.has(skillId)) latestBySkill.set(skillId, mapExecutionRow(row));
  }

  return skills.map((skill) => ({ ...skill, lastScheduledRun: latestBySkill.get(skill.id) ?? null }));
}

export async function getSkill(id: string): Promise<Skill | null> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw describeError("getSkill", error, status, statusText);
  return data ? mapSkillRow(data) : null;
}

export async function getSkillWithExecutions(
  id: string
): Promise<(Skill & { executions: Execution[] }) | null> {
  const skill = await getSkill(id);
  if (!skill) return null;

  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .select("*")
    .eq("skill_id", id)
    .order("started_at", { ascending: false });
  if (error) throw describeError("getSkillWithExecutions", error, status, statusText);

  return { ...skill, executions: (data ?? []).map(mapExecutionRow) };
}

/** Looks up a skill by its public share token (see enableSkillSharing) and
 *  returns the same shape as getSkillWithExecutions — the /share/[token]
 *  page's only entry point, so a disabled/never-shared token just returns
 *  null instead of leaking anything. */
export async function getSkillWithExecutionsByShareToken(
  token: string
): Promise<(Skill & { executions: Execution[] }) | null> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .select("id")
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw describeError("getSkillWithExecutionsByShareToken", error, status, statusText);
  if (!data) return null;
  return getSkillWithExecutions(data.id as string);
}

/** Turns sharing on for a skill, generating a fresh unguessable token if it
 *  doesn't already have one (idempotent — re-enabling an already-shared
 *  skill keeps its existing link working instead of silently breaking it). */
export async function enableSkillSharing(id: string): Promise<Skill | null> {
  const skill = await getSkill(id);
  if (!skill) return null;
  if (skill.shareToken) return skill;

  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .update({ share_token: randomUUID(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw describeError("enableSkillSharing", error, status, statusText);
  return data ? mapSkillRow(data) : null;
}

/** Turns sharing off — the old token stops resolving immediately (it's
 *  cleared, not just flagged), so a link that already circulated can be
 *  revoked for good. */
export async function disableSkillSharing(id: string): Promise<Skill | null> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .update({ share_token: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw describeError("disableSkillSharing", error, status, statusText);
  return data ? mapSkillRow(data) : null;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  promptTemplate: string;
  needsInput: boolean;
  usesCowork: boolean;
  inputSchema: InputField[];
  sourcePost: string | null;
  group: string | null;
  tags: string[];
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .insert({
      name: input.name,
      description: input.description,
      prompt_template: input.promptTemplate,
      needs_input: input.needsInput,
      uses_cowork: input.usesCowork,
      input_schema: input.inputSchema.length ? input.inputSchema : null,
      source_post: input.sourcePost,
      status: "draft",
      confirmed_once: false,
      group: input.group,
      tags: input.tags,
      // A new skill should land at the top of the dashboard by default
      // (matching the old created_at-desc ordering this position column
      // replaced) without needing to look up the current minimum first —
      // -Date.now() is always more negative than any position a
      // pre-existing skill (or the schema's own backfill, small positive
      // integers) could have.
      position: -Date.now(),
    })
    .select()
    .single();
  if (error) throw describeError("createSkill", error, status, statusText);
  return mapSkillRow(data);
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  promptTemplate?: string;
  needsInput?: boolean;
  usesCowork?: boolean;
  status?: Skill["status"];
  confirmedOnce?: boolean;
  inputSchema?: InputField[] | null;
  group?: string | null;
  tags?: string[];
  schedule?: SkillSchedule | null;
  scheduleInputValues?: Record<string, string> | null;
  scheduleApiSources?: Record<string, ApiFieldSource[]> | null;
  outputCallbacks?: OutputCallback[] | null;
  scheduleLastRunAt?: Date;
  pinned?: boolean;
  position?: number;
  systemSecrets?: string[] | null;
  accountSplit?: SkillAccountSplit | null;
}

/**
 * `changedBy` is only used to attribute a prompt-template edit in
 * skill_prompt_versions (display name of whoever made it) — irrelevant for
 * any other field, so every other caller just omits it.
 */
export async function updateSkill(
  id: string,
  patch: UpdateSkillInput,
  changedBy?: string | null
): Promise<Skill | null> {
  const supabase = getSupabase();

  // Snapshot the OLD prompt before it's overwritten, but only when it's
  // actually changing — editing every other field on the skill (or saving
  // the same prompt text unchanged) shouldn't pile up a no-op version.
  if (patch.promptTemplate !== undefined) {
    const { data: current } = await supabase
      .from("skills")
      .select("prompt_template")
      .eq("id", id)
      .maybeSingle();
    if (current && current.prompt_template !== patch.promptTemplate) {
      const { error: versionError } = await supabase.from("skill_prompt_versions").insert({
        skill_id: id,
        prompt_template: current.prompt_template as string,
        changed_by: changedBy ?? null,
      });
      if (versionError) throw describeError("updateSkill (prompt version)", versionError);
    }
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.promptTemplate !== undefined) row.prompt_template = patch.promptTemplate;
  if (patch.needsInput !== undefined) row.needs_input = patch.needsInput;
  if (patch.usesCowork !== undefined) row.uses_cowork = patch.usesCowork;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.confirmedOnce !== undefined) row.confirmed_once = patch.confirmedOnce;
  if (patch.inputSchema !== undefined) row.input_schema = patch.inputSchema;
  if (patch.group !== undefined) row.group = patch.group;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.schedule !== undefined) row.schedule = patch.schedule;
  if (patch.scheduleInputValues !== undefined) row.schedule_input_values = patch.scheduleInputValues;
  if (patch.scheduleApiSources !== undefined) row.schedule_api_sources = patch.scheduleApiSources;
  if (patch.outputCallbacks !== undefined) row.output_callbacks = patch.outputCallbacks;
  if (patch.scheduleLastRunAt !== undefined) row.schedule_last_run_at = patch.scheduleLastRunAt.toISOString();
  if (patch.pinned !== undefined) row.pinned = patch.pinned;
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.systemSecrets !== undefined) row.system_secrets = patch.systemSecrets;
  if (patch.accountSplit !== undefined) row.account_split = patch.accountSplit;

  const { data, error, status, statusText } = await supabase
    .from("skills")
    .update(row)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw describeError("updateSkill", error, status, statusText);
  return data ? mapSkillRow(data) : null;
}

/** Every past prompt version for a skill, most recent edit first — pure
 *  history, doesn't include the current live version (that's just the
 *  skill's own promptTemplate). Empty for a skill whose prompt was never
 *  edited after creation. */
export async function listPromptVersions(skillId: string): Promise<PromptVersion[]> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skill_prompt_versions")
    .select("*")
    .eq("skill_id", skillId)
    .order("created_at", { ascending: false });
  if (error) throw describeError("listPromptVersions", error, status, statusText);
  return (data ?? []).map(mapPromptVersionRow);
}

export async function deleteSkill(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error, count, status, statusText } = await supabase
    .from("skills")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw describeError("deleteSkill", error, status, statusText);
  return (count ?? 0) > 0;
}

export interface ListExecutionsFilter {
  status?: string;
  skillId?: string;
}

export async function listExecutions(
  filter: ListExecutionsFilter = {}
): Promise<(Execution & { skill: { id: string; name: string } })[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("executions")
    .select("*, skill:skills(id, name)")
    .order("started_at", { ascending: false })
    .limit(200);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.skillId) query = query.eq("skill_id", filter.skillId);

  const { data, error, status, statusText } = await query;
  if (error) throw describeError("listExecutions", error, status, statusText);

  return (data ?? []).map((row) => {
    const skill = row.skill as { id: string; name: string } | null;
    return {
      ...mapExecutionRow(row),
      skill: { id: skill?.id ?? (row.skill_id as string), name: skill?.name ?? "Deleted skill" },
    };
  });
}

/**
 * Every outbound API call this app itself has made (lib/apiCallLog.ts) —
 * app/(app)/api-logs's data source, "what did the external API actually
 * send back" without needing server log access. Capped at 200, most recent
 * first, same reasoning as listExecutions above: a live-history view, not a
 * full export.
 */
export async function listApiCallLogs(filter: {
  skillId?: string;
  direction?: "input" | "output";
} = {}): Promise<ApiCallLog[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("api_call_logs")
    .select("*, skill:skills(id, name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.skillId) query = query.eq("skill_id", filter.skillId);
  if (filter.direction) query = query.eq("direction", filter.direction);

  const { data, error, status, statusText } = await query;
  if (error) throw describeError("listApiCallLogs", error, status, statusText);

  return (data ?? []).map((row) => {
    const skill = row.skill as { id: string; name: string } | null;
    return {
      id: row.id as string,
      skillId: (row.skill_id as string | null) ?? null,
      skillName: skill?.name ?? null,
      fieldKey: (row.field_key as string | null) ?? null,
      direction: row.direction as ApiCallLog["direction"],
      kind: row.kind as ApiCallLog["kind"],
      url: row.url as string,
      method: row.method as string,
      requestHeaders: (row.request_headers as Record<string, string> | null) ?? null,
      requestBody: (row.request_body as string | null) ?? null,
      responseStatus: (row.response_status as number | null) ?? null,
      responseBody: (row.response_body as string | null) ?? null,
      error: (row.error as string | null) ?? null,
      createdAt: new Date(row.created_at as string),
    };
  });
}

/**
 * Every execution currently pending/running, across every skill — the
 * "what's running now" homepage strip's data source. Unlike CoworkQueueBadge
 * (a Cowork-only count), this covers every source (Claude-direct, scheduled,
 * manual) so a stuck Claude-direct run or a scheduled job in flight shows up
 * here too, not just Cowork jobs. Capped at 50: this is a live-status
 * glance, not a list view, and the app has no path that leaves hundreds of
 * executions genuinely in flight at once.
 */
export async function listActiveExecutions(): Promise<
  (Execution & { skill: { id: string; name: string } })[]
> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .select("*, skill:skills(id, name)")
    .in("status", ["pending", "running"])
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw describeError("listActiveExecutions", error, status, statusText);

  return (data ?? []).map((row) => {
    const skill = row.skill as { id: string; name: string } | null;
    return {
      ...mapExecutionRow(row),
      skill: { id: skill?.id ?? (row.skill_id as string), name: skill?.name ?? "Deleted skill" },
    };
  });
}

/**
 * Every execution ever recorded, for GET /api/executions/export — unlike
 * listExecutions' 200-row cap (a fast list view), this is meant to be a
 * genuine full backup/analysis export, so it doesn't cap or filter.
 * Skips `conversation_state` (internal mid-run plumbing, not useful outside
 * the app and can be large) but otherwise mirrors listExecutions' shape.
 */
export async function listAllExecutionsForExport(): Promise<
  (Execution & { skill: { id: string; name: string } })[]
> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .select(
      "id, skill_id, status, source, input_values, prompt_snapshot, result, error, files, usage, ran_by, favorite, started_at, finished_at, skill:skills(id, name)"
    )
    .order("started_at", { ascending: false });
  if (error) throw describeError("listAllExecutionsForExport", error, status, statusText);

  return (data ?? []).map((row) => {
    const skill = row.skill as unknown as { id: string; name: string } | null;
    return {
      ...mapExecutionRow(row),
      skill: { id: skill?.id ?? (row.skill_id as string), name: skill?.name ?? "Deleted skill" },
    };
  });
}

/**
 * True lifetime total across every execution ever recorded — unlike
 * listExecutions' 200-row cap (built for a fast, recent-first list view),
 * this exists so a "how much have I spent" total isn't quietly wrong once a
 * workspace has more history than that. Only pulls the `usage` column, not
 * full rows (prompt/result text can be large), to stay cheap regardless of
 * how much history there is.
 */
export async function getTotalUsage(): Promise<{ usage: TokenUsage; executionsWithUsage: number }> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .select("usage")
    .not("usage", "is", null);
  if (error) throw describeError("getTotalUsage", error, status, statusText);

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  for (const row of data ?? []) {
    usage = sumTokenUsage(usage, row.usage as TokenUsage);
  }
  return { usage, executionsWithUsage: (data ?? []).length };
}

export async function getExecution(id: string): Promise<Execution | null> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw describeError("getExecution", error, status, statusText);
  return data ? mapExecutionRow(data) : null;
}

export interface CreateExecutionInput {
  skillId: string;
  status: ExecutionStatus;
  source: ExecutionSource;
  inputValues: Record<string, string> | null;
  promptSnapshot: string;
  result: string | null;
  error: string | null;
  files: ExecutionFile[] | null;
  ranBy: string | null;
  dryRun?: boolean;
  /** See Skill.accountSplit / Execution.coworkAccountLabel. */
  coworkAccountLabel?: string | null;
  coworkClaudeInstance?: string | null;
}

export async function createExecution(input: CreateExecutionInput): Promise<Execution> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const isTerminal = input.status !== "pending" && input.status !== "running";
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .insert({
      skill_id: input.skillId,
      status: input.status,
      source: input.source,
      input_values: input.inputValues,
      prompt_snapshot: input.promptSnapshot,
      result: input.result,
      error: input.error,
      files: input.files,
      ran_by: input.ranBy,
      dry_run: input.dryRun ?? false,
      cowork_account_label: input.coworkAccountLabel ?? null,
      cowork_claude_instance: input.coworkClaudeInstance ?? null,
      started_at: now,
      finished_at: isTerminal ? now : null,
    })
    .select()
    .single();
  if (error) throw describeError("createExecution", error, status, statusText);
  return mapExecutionRow(data);
}

/**
 * Stores the real, unmasked prompt for a queued Cowork job — see
 * lib/cowork.ts for the whole async-dispatch design. This is the one place
 * in the app that persists a full unmasked prompt (everywhere else, the
 * real prompt only ever exists in memory for the one dispatch call), and
 * only transiently: claimNextCoworkJob clears it the instant the agent
 * picks the job up. Deliberately not part of UpdateExecutionInput/the
 * Execution type — mapExecutionRow never reads this column, so it cannot
 * leak into any UI path or JSON response other than the Cowork agent's own
 * next-job endpoint.
 */
export async function setCoworkPayload(executionId: string, payload: string): Promise<void> {
  const supabase = getSupabase();
  console.log(`[cowork-agent-server] setCoworkPayload: writing payload (${payload.length} chars) to execution ${executionId}`);
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .update({ cowork_payload: payload })
    .eq("id", executionId)
    .select("id, status, cowork_payload");
  if (error) throw describeError("setCoworkPayload", error, status, statusText);
  console.log(`[cowork-agent-server] setCoworkPayload: update call itself returned HTTP ${status} ${statusText}`);
  const updatedRow = data?.[0];
  console.log(
    `[cowork-agent-server] setCoworkPayload: update affected ${data?.length ?? 0} row(s)` +
      (updatedRow
        ? `; row ${updatedRow.id} now has status="${updatedRow.status}", hasPayload=${updatedRow.cowork_payload !== null}`
        : " — no row matched this executionId, which means the job was never actually queued")
  );

  // Read-your-write check, deliberately via a fresh plain SELECT instead of
  // trusting the UPDATE...RETURNING data above — if this disagrees with what
  // the update itself just reported, that's a real clue (a second writer
  // racing this one, or the two queries somehow hitting different data)
  // rather than something wrong with claimNextCoworkJob's later query.
  const { data: verifyRow, error: verifyError } = await supabase
    .from("executions")
    .select("id, status, cowork_payload")
    .eq("id", executionId)
    .maybeSingle();
  if (verifyError) {
    console.log(`[cowork-agent-server] setCoworkPayload: verificação pós-escrita falhou:`, verifyError.message);
  } else {
    console.log(
      `[cowork-agent-server] setCoworkPayload: verificação pós-escrita (SELECT separado) — ` +
        (verifyRow
          ? `status="${verifyRow.status}", hasPayload=${verifyRow.cowork_payload !== null && verifyRow.cowork_payload !== undefined}`
          : "linha não encontrada (!)")
    );
  }
}

/** Manual kill switch for the Cowork queue — see supabase/schema.sql's
 *  cowork_agent_status.queue_paused. A missing row (fresh setup) reads as
 *  not-paused, same "nothing configured yet" default as getCoworkAgentLastSeen. */
export async function isCoworkQueuePaused(): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("cowork_agent_status")
    .select("queue_paused")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw describeError("isCoworkQueuePaused", error, status, statusText);
  return Boolean(data?.queue_paused);
}

/** Toggled from the dashboard's Cowork queue badge — upsert so this works
 *  even before the agent has ever polled once (no cowork_agent_status row
 *  yet). Only sets id/queue_paused, so it can't clobber last_seen_at on an
 *  existing row. */
export async function setCoworkQueuePaused(paused: boolean): Promise<void> {
  const supabase = getSupabase();
  const { error, status, statusText } = await supabase
    .from("cowork_agent_status")
    .upsert({ id: 1, queue_paused: paused });
  if (error) throw describeError("setCoworkQueuePaused", error, status, statusText);
}

export interface CoworkJob {
  executionId: string;
  skillName: string;
  prompt: string;
  /** See Execution.coworkAccountLabel/coworkClaudeInstance — set only when
   *  this job came from a Skill.accountSplit split. mac-agent/agent.js
   *  finds the already-running, already-logged-in Claude Desktop instance
   *  matching claudeInstance (by process id, via findRunningInstancePid)
   *  and drives that one specifically, instead of the default instance. */
  accountLabel: string | null;
  claudeInstance: string | null;
}

/**
 * Hands the oldest queued Cowork job to whichever agent asks for it via
 * GET /api/cowork-agent/next-job, and clears its stored payload in the
 * same call — so the raw prompt never sits in the database longer than it
 * has to, and (single-agent assumption: one Mac mini polling at a time,
 * not a real `SELECT ... FOR UPDATE SKIP LOCKED`) a job can't be handed
 * out twice. Matches on `cowork_payload is not null` rather than
 * `source = 'cowork'`, since a *scheduled* run of a Cowork skill still has
 * source "scheduled" (see lib/runSkill.ts's startExecution) — the payload
 * itself is the only reliable "this is a queued Cowork job" signal.
 */
export async function claimNextCoworkJob(): Promise<CoworkJob | null> {
  const supabase = getSupabase();
  console.log("[cowork-agent-server] claimNextCoworkJob: starting search for a queued job");

  if (await isCoworkQueuePaused()) {
    console.log("[cowork-agent-server] fila pausada manualmente — não entregando nenhum job agora");
    return null;
  }

  // A one-off diagnostic pass (2 extra queries + a full char-code dump of
  // every "running"/payload-carrying row) used to run here unconditionally
  // on every single poll — meant to chase a specific historical status-
  // string mismatch bug, never actually read by the real query below, and
  // never removed once that bug was found. Left running indefinitely, it
  // cost 2 extra DB round-trips and heavy log output on every ~15s poll
  // forever. Removed; re-add a scoped version of it if a similar mismatch
  // ever needs diagnosing again.

  // Deliberately NOT embedding skills(name) here via a join (e.g.
  // .select("id, skill_id, cowork_payload, skills(name)")) — confirmed by
  // the diagnostic query above that a row matching these exact filters can
  // exist while the embedded-join version of this same query still comes
  // back empty (no error, just zero rows), which silently ate every queued
  // Cowork job. Two plain queries instead: fetch the execution, then the
  // skill name separately.
  const {
    data,
    error,
    status,
    statusText,
  } = await supabase
    .from("executions")
    .select("id, skill_id, cowork_payload, cowork_account_label, cowork_claude_instance")
    .eq("status", "running")
    .not("cowork_payload", "is", null)
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  console.log(
    `[cowork-agent-server] claimNextCoworkJob: query final retornou HTTP ${status} ${statusText}, error=${error ? error.message : "null"}, data=${data ? JSON.stringify({ id: data.id, payloadLen: data.cowork_payload?.length ?? 0 }) : "null"}`
  );
  if (error) throw describeError("claimNextCoworkJob", error, status, statusText);
  if (!data) {
    console.log("[cowork-agent-server] resultado: nenhum job do Cowork pra entregar ao agente agora");
    return null;
  }
  console.log(`[cowork-agent-server] resultado: entregando execução ${data.id} ao agente`);

  const executionId = data.id as string;
  const prompt = data.cowork_payload as string;

  const { data: skillRow, error: skillError } = await supabase
    .from("skills")
    .select("name")
    .eq("id", data.skill_id)
    .maybeSingle();
  if (skillError) {
    console.log(`[cowork-agent-server] falha ao buscar o nome da skill ${data.skill_id}:`, skillError.message);
  }
  const skillName = skillRow?.name ?? "Skill";

  const {
    error: clearError,
    status: clearStatus,
    statusText: clearStatusText,
  } = await supabase.from("executions").update({ cowork_payload: null }).eq("id", executionId);
  if (clearError) {
    throw describeError("claimNextCoworkJob (clear payload)", clearError, clearStatus, clearStatusText);
  }
  console.log(`[cowork-agent-server] payload da execução ${executionId} limpo após entrega ao agente`);

  return {
    executionId,
    skillName,
    prompt,
    accountLabel: (data.cowork_account_label as string | null) ?? null,
    claudeInstance: (data.cowork_claude_instance as string | null) ?? null,
  };
}

/** Stamped by POST /api/cowork-agent/mark-started the moment the Mac mini
 *  agent actually begins driving Cowork for a claimed job (right before it
 *  runs the AppleScript) — separate from claimNextCoworkJob's handoff,
 *  which only means the job left the queue, not that Cowork itself has
 *  started working on it. Best-effort like recordCoworkAgentSeen: a failed
 *  stamp shouldn't ever block the agent from actually running the job. */
export async function markCoworkStarted(executionId: string): Promise<void> {
  const supabase = getSupabase();
  const { error, status, statusText } = await supabase
    .from("executions")
    .update({ cowork_started_at: new Date().toISOString() })
    .eq("id", executionId)
    .eq("status", "running");
  if (error) throw describeError("markCoworkStarted", error, status, statusText);
}

/** Feeds the dashboard's Cowork queue badge (components/CoworkQueueBadge.tsx)
 *  — "waiting" is queued but not yet claimed by the agent (cowork_payload
 *  still set, same signal claimNextCoworkJob matches on), "inProgress" is
 *  claimed and being worked on (payload cleared, status still running).
 *  "paused" mirrors isCoworkQueuePaused so the badge can render the kill
 *  switch's current state without a second round-trip. */
export async function getCoworkQueueSummary(): Promise<{
  waiting: number;
  inProgress: number;
  paused: boolean;
}> {
  const supabase = getSupabase();
  const [waitingResult, inProgressResult, paused] = await Promise.all([
    supabase
      .from("executions")
      .select("id", { count: "exact", head: true })
      .eq("status", "running")
      .eq("source", "cowork")
      .not("cowork_payload", "is", null),
    supabase
      .from("executions")
      .select("id", { count: "exact", head: true })
      .eq("status", "running")
      .eq("source", "cowork")
      .is("cowork_payload", null),
    isCoworkQueuePaused(),
  ]);
  if (waitingResult.error) {
    throw describeError("getCoworkQueueSummary (waiting)", waitingResult.error, waitingResult.status, waitingResult.statusText);
  }
  if (inProgressResult.error) {
    throw describeError(
      "getCoworkQueueSummary (inProgress)",
      inProgressResult.error,
      inProgressResult.status,
      inProgressResult.statusText
    );
  }
  return { waiting: waitingResult.count ?? 0, inProgress: inProgressResult.count ?? 0, paused };
}

/** Stamped by GET /api/cowork-agent/next-job on every poll from the Mac
 *  mini agent — see supabase/schema.sql's cowork_agent_status. Failing to
 *  record a heartbeat shouldn't ever block handing the agent a real job,
 *  so callers should treat this as best-effort (log, don't throw) rather
 *  than fatal. */
export async function recordCoworkAgentSeen(): Promise<void> {
  const supabase = getSupabase();
  const { error, status, statusText } = await supabase
    .from("cowork_agent_status")
    .upsert({ id: 1, last_seen_at: new Date().toISOString() });
  if (error) throw describeError("recordCoworkAgentSeen", error, status, statusText);
}

/** null means the agent has never polled at all (row doesn't exist yet, or
 *  last_seen_at was never stamped) — the dashboard shows "nunca conectou"
 *  for that case rather than treating it the same as "polled a while
 *  ago". */
export async function getCoworkAgentLastSeen(): Promise<Date | null> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("cowork_agent_status")
    .select("last_seen_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw describeError("getCoworkAgentLastSeen", error, status, statusText);
  return data?.last_seen_at ? new Date(data.last_seen_at as string) : null;
}

export interface UpdateExecutionInput {
  status?: ExecutionStatus;
  result?: string | null;
  error?: string | null;
  files?: ExecutionFile[] | null;
  steps?: string[] | null;
  conversationState?: ConversationState | null;
  usage?: TokenUsage | null;
  favorite?: boolean;
  archived?: boolean;
  outputCallbackResults?: OutputCallbackResult[] | null;
}

/**
 * Updates an in-flight execution row — either to its final state, or (for a
 * Claude-direct run split across multiple requests, see lib/runSkill.ts's
 * runSkillChunk) to a mid-flight checkpoint that stays "running" with a
 * saved conversationState for the next chunk to resume from. Executions are
 * written as "running" the moment a run starts (createExecution above) and
 * updated here as it progresses — never a single insert-at-the-end — so a
 * row already exists even if the process gets killed outright (e.g. a
 * platform timeout mid-chunk on a slow skill) instead of leaving no trace,
 * matching the security baseline that every attempt gets recorded.
 * `finished_at` is only stamped when the patch's status is a terminal one.
 */
export async function updateExecution(
  id: string,
  patch: UpdateExecutionInput
): Promise<Execution | null> {
  const supabase = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    row.status = patch.status;
    if (patch.status !== "pending" && patch.status !== "running") {
      row.finished_at = new Date().toISOString();
    }
  }
  if (patch.result !== undefined) row.result = patch.result;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.files !== undefined) row.files = patch.files;
  if (patch.steps !== undefined) row.steps = patch.steps;
  if (patch.conversationState !== undefined) row.conversation_state = patch.conversationState;
  if (patch.usage !== undefined) row.usage = patch.usage;
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  if (patch.archived !== undefined) row.archived = patch.archived;
  if (patch.outputCallbackResults !== undefined) row.output_callback_results = patch.outputCallbackResults;

  const { data, error, status, statusText } = await supabase
    .from("executions")
    .update(row)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw describeError("updateExecution", error, status, statusText);
  return data ? mapExecutionRow(data) : null;
}

/**
 * Manually cancels a stuck/unwanted execution — the escape hatch that used
 * to only exist as "go delete the row by hand in Supabase's SQL editor"
 * (exactly what today's debugging session had to resort to). Only acts on
 * "pending"/"running" rows — cancelling something already finished would
 * silently overwrite a real result/error, so this is a no-op (returns null)
 * for anything else. Also clears cowork_payload defensively: a cancelled
 * job that's still sitting in the Cowork queue (never claimed yet) must not
 * be handed to the agent after this.
 */
export async function cancelExecution(id: string, cancelledBy: string | null): Promise<Execution | null> {
  const supabase = getSupabase();
  const { data: current, error: readError } = await supabase
    .from("executions")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw describeError("cancelExecution (read)", readError);
  if (!current || (current.status !== "pending" && current.status !== "running")) return null;

  const { data, error, status, statusText } = await supabase
    .from("executions")
    .update({
      status: "error",
      error: cancelledBy ? `Cancelada manualmente por ${cancelledBy}.` : "Cancelada manualmente.",
      cowork_payload: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw describeError("cancelExecution (update)", error, status, statusText);
  return data ? mapExecutionRow(data) : null;
}

/**
 * Uploads a real generated file's bytes (from Claude's code execution tool)
 * to Supabase Storage's `execution-files` bucket, so this app owns its own
 * copy of the execution's output independent of Anthropic's file retention.
 */
export async function uploadExecutionFile(
  storagePath: string,
  bytes: Buffer,
  mimeType: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from("execution-files")
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`uploadExecutionFile: ${error.message}`);
}

/**
 * Downloads a real generated file's bytes from Supabase Storage
 * (`execution-files` bucket) for the download route to stream back —
 * server-side only, using the service role key like every other table/
 * storage access in this file.
 */
export async function downloadExecutionFile(storagePath: string): Promise<Blob> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from("execution-files").download(storagePath);
  if (error) throw new Error(`downloadExecutionFile: ${error.message}`);
  return data;
}
