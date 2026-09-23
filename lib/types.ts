// "file" lets a run-time value come from an uploaded file instead of being
// typed — but only text-extractable files (txt/csv/json/md), decoded
// client-side (DynamicForm) into a plain string, exactly like a textarea.
// It's not a separate storage kind: everywhere downstream (masking, retry
// prefill, scheduling defaults, history) treats it as ordinary text, since
// that's literally what it becomes the moment it's read.
//
// "video" is the same idea but resolved server-side instead of in the
// browser: the person pastes a YouTube/Instagram/X link, and lib/transcribe.ts
// swaps it for that video's transcript right before the prompt is built (see
// lib/runSkill.ts's resolveInputValues) — the skill's prompt template never
// sees the raw URL, just the transcript text.
export type InputFieldType = "text" | "textarea" | "secret" | "url" | "number" | "file" | "video";

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
  /** A Cowork run's own account of what it did, in order (e.g. "Abri a
   *  página do jogador no HLTV", "Cliquei na aba Stats") — separate from
   *  `result`'s narrative summary so the dashboard can render it as a
   *  distinct step list instead of folding it into the free-text result.
   *  Only Cowork dispatch (report_cowork_result) ever sets this; direct
   *  Claude/scheduled runs leave it undefined. */
  steps?: string[];
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
 * How to turn a raw external API response into one input field's text
 * value, applied deterministically (no AI call) on every scheduled run —
 * lib/apiFieldSource.ts's applyApiFieldMapping(). Generated once, by AI,
 * from a live sample response (lib/proposeApiFieldMapping.ts), then saved
 * and reused as-is; see components/ScheduleModal.tsx's "Testar e gerar
 * mapeamento" step.
 *
 * "single" reaches one scalar value via a dot/bracket path ("" = the root
 * value itself). "list" is for a textarea field that wants one line per
 * item from an array in the response — each item optionally filtered by an
 * exact field match first (e.g. only rows whose "status" field equals
 * "pendente"), then formatted through itemTemplate's "{fieldName}"
 * placeholders (matching the item object's own keys) and joined (default a
 * newline).
 */
export type ApiFieldMapping =
  | { kind: "single"; path: string }
  | {
      kind: "list";
      listPath: string;
      filter: { field: string; equals: string } | null;
      itemTemplate: string;
      join: string;
    };

export interface ApiFieldSource {
  url: string;
  /** Just enough for the common case (a bearer/API-key header) — not a
   *  general headers editor. See components/ScheduleModal.tsx. */
  headers?: Record<string, string> | null;
  mapping: ApiFieldMapping;
}

/**
 * A per-skill (not per-schedule) callback: after ANY execution of this
 * skill finishes successfully — manual, scheduled, Cowork, Claude-direct,
 * doesn't matter, they all funnel through lib/runSkill.ts's
 * finishExecution() — POST the result's own table to this URL, built into
 * whatever request body the target API expects. For confirming things
 * like activation protocols back into another system the person owns,
 * instead of copying them over by hand.
 *
 * itemFieldMap is an array of pairs rather than a plain
 * Record<string,string> map on purpose — an object with unknown/dynamic
 * keys doesn't express well in a strict JSON schema for AI-generated
 * structured output (see lib/proposeOutputCallback.ts), while an array of
 * fixed-shape { targetKey, sourceHeader } objects does, matching the same
 * pattern already used for inputSchema elsewhere in this app.
 */
export interface OutputCallback {
  url: string;
  method: "POST" | "PUT" | "PATCH";
  headers?: Record<string, string> | null;
  /** sourceHeader must match a column header in the result's own markdown
   *  table exactly (lib/resultTable.ts's parseMarkdownTable) — targetKey is
   *  whatever field name the destination API's item shape wants. */
  itemFieldMap: { targetKey: string; sourceHeader: string }[];
  /** Dot path (within an otherwise-empty object) where the built items
   *  array goes in the final request body — "items" for {"items": [...]},
   *  "" to send the array itself as the whole body. */
  itemsPath: string;
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
  /** Per-field alternative to scheduleInputValues: instead of a fixed saved
   *  value, fetch a fresh value from an external API right before each
   *  scheduled run (lib/apiFieldSource.ts). A field key appears in at most
   *  one of scheduleInputValues / scheduleApiSources, never both — see
   *  components/ScheduleModal.tsx's save() for how that's enforced. */
  scheduleApiSources: Record<string, ApiFieldSource> | null;
  scheduleLastRunAt: Date | null;
  /** Fires on every successful execution of this skill, any source — not
   *  tied to scheduling at all. See lib/outputCallback.ts. */
  outputCallback: OutputCallback | null;
  /** Personal dashboard-organization preference — pinned skills sort to the
   *  top of the skills list. Not part of the skill's definition, so it's
   *  left out of export/import. */
  pinned: boolean;
  /** Set means /share/<token> shows a read-only public view of this skill
   *  (name, description, execution history — no prompt template, no run
   *  button, no login required). Null means sharing is off. */
  shareToken: string | null;
  /** Drag-and-drop order on the dashboard (components/SkillsBoard.tsx),
   *  ascending — lower sorts first. A fractional/"lexoRank"-style value:
   *  dropping a card between two neighbors sets its position to the
   *  midpoint of theirs, so reordering one card is a single-row update
   *  instead of renumbering the whole list. Personal preference like
   *  pinned, not part of the skill's definition — left out of
   *  export/import. */
  position: number;
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
  /** See DispatchResult.steps — persisted the same way as files. */
  steps: string[] | null;
  conversationState: ConversationState | null;
  usage: TokenUsage | null;
  ranBy: string | null;
  /** Starred by hand — "this was the good run" among several attempts. Pure
   *  UI convenience, no effect on scheduling/retry/anything else. */
  favorite: boolean;
  /** Set only for a Cowork execution, the moment the Mac mini agent actually
   *  starts driving Cowork for it (POST /api/cowork-agent/mark-started) —
   *  null while it's still sitting in the queue waiting for the agent to
   *  poll it up. Lets the UI distinguish "queued" from "in progress" instead
   *  of both just reading "running". */
  coworkStartedAt: Date | null;
  /** Set only when the skill has an outputCallback configured and this
   *  execution actually finished successfully (see lib/runSkill.ts's
   *  finishExecution) — null for a skill with no callback, or a run that
   *  never reached the point of trying to send one. "never fail silently"
   *  applies to this side-effect too: a failed send is recorded here, not
   *  just logged. */
  outputCallbackStatus: "sent" | "failed" | null;
  outputCallbackError: string | null;
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
