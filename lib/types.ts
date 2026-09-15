export type InputFieldType = "text" | "textarea" | "secret" | "url" | "number";

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

export interface DispatchResult {
  status: DispatchStatus;
  result?: string;
  error?: string;
  files?: ExecutionFile[];
}

export type SkillStatus = "draft" | "active" | "archived";
export type ExecutionStatus = "pending" | "running" | "success" | "error" | "needs_setup";
export type ExecutionSource = "cowork" | "claude" | "manual";

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
  ranBy: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}
