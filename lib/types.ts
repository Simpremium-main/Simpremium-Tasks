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
  needsReview: boolean; // true when produced by the heuristic fallback, not AI extraction
  reviewNote?: string;
}

export type DispatchStatus = "success" | "error" | "needs_setup";

export interface DispatchResult {
  status: DispatchStatus;
  result?: string;
  error?: string;
}
