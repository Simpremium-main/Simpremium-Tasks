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
  /** See Skill.systemSecrets — optional, defaults to none for a freshly
   *  parsed draft (never inferred from a pasted post; only ever set by hand
   *  afterward, for the rare skill that needs a fixed, non-retyped
   *  credential). */
  systemSecrets: string[] | null;
  /** See Skill.accountSplit — same "optional, never inferred from a pasted
   *  post" rule as systemSecrets: only ever set by hand afterward. */
  accountSplit: SkillAccountSplit | null;
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

/** One outbound send's outcome, recorded per callback on the execution —
 *  see Skill.outputCallbacks (a skill can fan a single result out to
 *  several destinations) and Execution.outputCallbackResults. */
export interface OutputCallbackResult {
  url: string;
  /** "skipped" means the run had a dry-run flag set — the body was still
   *  built and is visible in `lastBody`, but nothing was actually sent. */
  status: "sent" | "failed" | "skipped";
  error: string | null;
  /** The exact JSON body that was (attempted to be) sent — set even when
   *  the send itself failed or was skipped, so it's always visible what
   *  would go out, not just whether it succeeded. */
  lastBody: string | null;
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

/**
 * One named account a multi-account Cowork skill's rows can belong to — see
 * Skill.accountSplit. `pattern` is a case-insensitive regex source tested
 * against each line of the split field's value (a plain substring like
 * "MUNDO" is valid regex too, so this covers the common case without a
 * separate "multiple keywords" UI); groups are tried in array order, first
 * match wins, so a more specific pattern (e.g. "MUNDO 2") should come before
 * a broader one it would otherwise also match (e.g. "MUNDO").
 */
export interface SkillAccountGroup {
  label: string;
  pattern: string;
}

/**
 * Opt-in, Cowork-only: splits one manual run into several separate
 * executions when the named input field's rows belong to more than one
 * account, instead of asking Cowork to log out of one account and into
 * another mid-task — something a real run showed doesn't work reliably
 * (see README's "Multi-account Cowork skills" section for the full story).
 * Each resulting execution gets only its own group's matching lines, tagged
 * with that group's label (Execution.coworkAccountLabel) so the Mac mini
 * agent knows to pause and ask a human to switch accounts inside Cowork's
 * own built-in browser before driving it — Cowork's browser is isolated
 * from the system browser and holds one persistent login per site with no
 * exposed way to select which account a task uses, so there's no automated
 * profile-switching mechanism to hook into (confirmed against Anthropic's
 * own docs — see the README section above for the full story, including an
 * earlier, wrong attempt at automating this via system Chrome profiles).
 * The skill's own prompt template is never touched by any of this — only
 * which lines go into which execution's input value.
 *
 * Only actually splits (see lib/accountSplit.ts) when every line in the
 * field cleanly matches exactly one group; any ambiguity (a line matching
 * zero or several groups) falls back to today's single-execution behavior
 * unchanged, leaning on the prompt's own "linha não bate com nenhuma conta,
 * pare e explique" instruction exactly as before this feature existed.
 */
export interface SkillAccountSplit {
  /** Must match an InputField.key from the skill's own inputSchema. */
  field: string;
  groups: SkillAccountGroup[];
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
   *  components/ScheduleModal.tsx's save() for how that's enforced.
   *  Each field can have MORE than one source — fetched and joined with
   *  "\n" (lib/schedule.ts's resolveScheduledInputValues), for a field like
   *  a pending-activations list that's actually split across two upstream
   *  queues/accounts. */
  scheduleApiSources: Record<string, ApiFieldSource[]> | null;
  scheduleLastRunAt: Date | null;
  /** Fires on every successful execution of this skill, any source — not
   *  tied to scheduling at all. Every entry gets the same result, sent to
   *  its own destination (lib/outputCallback.ts) — for a result that needs
   *  to be confirmed back into more than one downstream system. */
  outputCallbacks: OutputCallback[] | null;
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
  /** Names of server-side environment variables (Vercel) this skill's
   *  prompt template can reference by {{placeholder}} — resolved fresh at
   *  dispatch time (lib/systemSecrets.ts), merged into the run's input
   *  values as synthetic secret-typed fields so they're masked in
   *  promptSnapshot/history exactly like any other secret input, and never
   *  written to the database in plain text. For a fixed credential the
   *  person genuinely doesn't want to retype every run (a shared login,
   *  say) — not a substitute for the normal per-run inputSchema. Every name
   *  here must start with SKILL_SECRET_ (enforced on resolve, not just on
   *  save): a skill definition is editable by anyone with dashboard access,
   *  so without that namespace guard this would be a way to smuggle any
   *  other env var (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, ...) into
   *  a prompt Cowork/Claude then acts on. */
  systemSecrets: string[] | null;
  /** See SkillAccountSplit — null (the default) means no splitting, every
   *  skill behaves exactly as before this feature existed. */
  accountSplit: SkillAccountSplit | null;
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
  /** Set only when the skill has at least one outputCallback configured and
   *  this execution actually finished successfully (see lib/runSkill.ts's
   *  finishExecution) — null for a skill with none configured, or a run
   *  that never reached the point of trying to send one. One entry per
   *  configured callback, same order as Skill.outputCallbacks — "never fail
   *  silently" applies to this side-effect too: a failed send is recorded
   *  here, not just logged, and one callback failing doesn't stop the
   *  others from being attempted. */
  outputCallbackResults: OutputCallbackResult[] | null;
  /** Set at run start (see lib/runSkill.ts's startExecution) — the skill
   *  runs for real exactly as normal, this only ever changes whether
   *  finishExecution actually calls sendOutputCallback at the end or just
   *  builds and records the body it *would* have sent. Never affects
   *  dispatch itself (Cowork/Claude), only this one side effect. */
  dryRun: boolean;
  /** Set only when this execution was created by Skill.accountSplit
   *  splitting a multi-account batch — the matched group's label, so the
   *  Mac mini agent knows to pause and ask for an account switch inside
   *  Cowork's own browser before driving it on this job (see
   *  SkillAccountSplit). Null for every other execution. */
  coworkAccountLabel: string | null;
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

export type ApiCallDirection = "input" | "output";
/** fetch = a real scheduled/manual-button run resolving an API-sourced
 *  field; test = the live sample fetch inside "Testar e gerar mapeamento";
 *  raw = the "Ver resposta bruta" button; send = a real output callback
 *  POST (lib/outputCallback.ts's sendOutputCallback). */
export type ApiCallKind = "fetch" | "test" | "raw" | "send";

/** Every outbound HTTP request this app itself makes to an external system
 *  — see lib/apiCallLog.ts. Purely a debugging/audit trail (app/(app)/api-logs),
 *  never read by any runtime logic. */
export interface ApiCallLog {
  id: string;
  skillId: string | null;
  skillName: string | null;
  fieldKey: string | null;
  direction: ApiCallDirection;
  kind: ApiCallKind;
  url: string;
  method: string;
  requestHeaders: Record<string, string> | null;
  requestBody: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  createdAt: Date;
}
