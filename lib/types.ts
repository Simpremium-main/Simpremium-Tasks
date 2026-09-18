// "file" lets a run-time value come from an uploaded file instead of being
// typed — but only text-extractable files (txt/csv/json/md), decoded
// client-side (DynamicForm) into a plain string, exactly like a textarea.
// It's not a separate storage kind: everywhere downstream (masking, retry
// prefill, scheduling defaults, history) treats it as ordinary text, since
// that's literally what it becomes the moment it's read.
export type InputFieldType = "text" | "textarea" | "secret" | "url" | "number" | "file";

export interface InputField {
  key: string;
  label: string;
  type: InputFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

/** The fields a person can actually edit for a skill, whether they're
 *  reviewing a freshly-parsed draft (NewSkillForm) or editing one that
 *  already exists (EditSkillForm) — both render components/SkillFieldsEditor
 *  against this same shape. */
export interface EditableSkillFields {
  name: string;
  description: string;
  promptTemplate: string;
  needsInput: boolean;
  usesCowork: boolean;
  inputSchema: InputField[];
  group: string | null;
  tags: string[];
}

export interface SkillDraftProposal extends EditableSkillFields {
  needsReview: boolean; // true when produced by the heuristic fallback, not AI extraction
  reviewNote?: string;
}

export type DispatchStatus = "success" | "error" | "needs_setup";

/** A real generated file (PDF, CSV, XLSX, ...) produced by a skill run, stored in
 *  Supabase Storage — not a text result exported client-side into a document shell. */
export interface ExecutionFile {
  name: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/** Raw token counts as Anthropic bills them — each chunk of a multi-request
 *  run resends the whole conversation so far (the Messages API is
 *  stateless), and Anthropic bills every one of those calls in full, so
 *  summing each chunk's own input/output tokens is the correct total cost,
 *  not double-counting. null for Cowork/heuristic dispatch, which don't go
 *  through the Claude API directly and have no token count to report. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens written to Anthropic's prompt cache this call (billed ~1.25x the
   *  normal input rate) and tokens read from it (billed ~0.1x) — see
   *  lib/claude.ts's cache_control usage. Optional/undefined on executions
   *  recorded before caching was added, or on non-Claude dispatch. */
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface DispatchResult {
  status: DispatchStatus;
  result?: string;
  error?: string;
  files?: ExecutionFile[];
  usage?: TokenUsage | null;
}

export type SkillStatus = "draft" | "active" | "archived";
export type ExecutionStatus = "pending" | "running" | "success" | "error" | "needs_setup";
export type ExecutionSource = "cowork" | "claude" | "manual" | "scheduled";

/**
 * A recurring schedule for a skill to run itself, checked (not precisely
 * timed) by GET /api/cron/run-scheduled on whatever cadence Vercel Cron
 * actually fires at — see lib/schedule.ts's isDue() for why that's fine.
 * `time` is "HH:MM" in UTC (24h) — deliberately not the browser's local
 * timezone, since the check runs server-side with no browser to ask.
 */
export interface SkillSchedule {
  frequency: "daily" | "weekly";
  time: string;
  /** 0 (Sunday) - 6 (Saturday), matching Date#getUTCDay(). Required (and only
   *  meaningful) when frequency is "weekly". */
  dayOfWeek?: number;
}

/**
 * Saved mid-flight state for a Claude-direct run that didn't finish in one
 * HTTP request. `messages` is the raw Anthropic conversation history
 * (assistant turns included) so the next chunk can resume exactly where
 * Claude paused — typed loosely here since this file doesn't depend on the
 * Anthropic SDK; lib/claude.ts casts it to the real message-param type.
 */
export interface ConversationState {
  messages: unknown[];
  chunkCount: number;
  /** Files collected from earlier chunks — a chunk that pauses mid-run may
   *  have already generated a real file even though the run isn't done yet,
   *  so this carries them forward rather than only keeping the last chunk's. */
  files: ExecutionFile[];
  /** Token usage summed across every chunk so far — see TokenUsage for why
   *  summing (not just keeping the latest chunk's) is the correct total. */
  usage: TokenUsage;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
  needsInput: boolean;
  usesCowork: boolean;
  promptTemplate: string;
  inputSchema: InputField[] | null;
  sourcePost: string | null;
  confirmedOnce: boolean;
  group: string | null;
  tags: string[];
  schedule: SkillSchedule | null;
  /** Saved defaults for a scheduled run's input form — secret-typed fields
   *  are never included (see lib/schedule.ts's hasUnschedulableSecret),
   *  since there's nowhere safe to store them for an unattended run. */
  scheduleInputValues: Record<string, string> | null;
  scheduleLastRunAt: Date | null;
  /** Personal dashboard-organization preference — pinned skills sort to the
   *  top of the skills list. Not part of the skill's definition, so it's
   *  left out of export/import. */
  pinned: boolean;
  /** Set means /share/<token> shows a read-only public view of this skill
   *  (name, description, execution history — no prompt template, no run
   *  button, no login required). Null means sharing is off. */
  shareToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Execution {
  id: string;
  skillId: string;
  status: ExecutionStatus;
  source: ExecutionSource;
  inputValues: Record<string, string> | null;
  promptSnapshot: string;
  result: string | null;
  error: string | null;
  files: ExecutionFile[] | null;
  conversationState: ConversationState | null;
  usage: TokenUsage | null;
  ranBy: string | null;
  /** Starred by hand — "this was the good run" among several attempts. Pure
   *  UI convenience, no effect on scheduling/retry/anything else. */
  favorite: boolean;
  startedAt: Date;
  finishedAt: Date | null;
}

/** A snapshot of a skill's prompt template right before an edit overwrote
 *  it — see lib/data.ts's updateSkill. Pure history: the skill's own
 *  promptTemplate always holds the current version. */
export interface PromptVersion {
  id: string;
  skillId: string;
  promptTemplate: string;
  changedBy: string | null;
  createdAt: Date;
}
