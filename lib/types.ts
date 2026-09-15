export type InputFieldType = "text" | "textarea" | "secret" | "url" | "number";

export interface InputField {
  key: string;
  label: string;
  type: InputFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface SkillDraftProposal {
  name: string;
  description: string;
  promptTemplate: string;
  needsInput: boolean;
  usesCowork: boolean;
  inputSchema: InputField[];
  group: string | null;
  tags: string[];
  needsReview: boolean; // true when produced by the heuristic fallback, not AI extraction
  reviewNote?: string;
}

export type DispatchStatus = "success" | "error" | "needs_setup";

export interface DispatchResult {
  status: DispatchStatus;
  result?: string;
  error?: string;
}

export type SkillStatus = "draft" | "active";
export type ExecutionStatus = "pending" | "running" | "success" | "error" | "needs_setup";
export type ExecutionSource = "cowork" | "claude" | "manual";

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
  ranBy: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}
