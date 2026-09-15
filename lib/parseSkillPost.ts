import Anthropic from "@anthropic-ai/sdk";
import { isClaudeConfigured } from "./claude";
import type { InputField, SkillDraftProposal } from "./types";

const EXTRACTION_SYSTEM_PROMPT = `You turn a social media post about a Claude skill/MCP into a structured skill definition for a dashboard. Read the pasted post and return ONLY a JSON object (no prose, no markdown fences) with this exact shape:

{
  "name": string (short, e.g. "Weekly Sales PDF Report"),
  "description": string (1-3 sentences, what it does and why it's useful),
  "promptTemplate": string (the instruction to send to Claude when this skill runs; use {{fieldKey}} for any value that must be filled in per-run),
  "needsInput": boolean (true if the skill needs any value from the user to run, e.g. a date range, a company name, a URL),
  "usesCowork": boolean (true if the post mentions or implies this depends on Claude Cowork to execute),
  "inputSchema": array of { "key": string (matches a {{key}} in promptTemplate), "label": string, "type": "text"|"textarea"|"secret"|"url"|"number", "required": boolean, "placeholder": string, "helpText": string } — empty array if needsInput is false. Use type "secret" for anything credential/token-like.
  "group": string or null — a short category for this skill (e.g. "Relatórios", "Pesquisa", "Atendimento", "Financeiro"), guessed from what it does. null if nothing fits.
  "tags": array of short lowercase strings (0-4), e.g. ["pdf", "vendas"].
}

Never invent a credential, token or endpoint that isn't in the post — if the skill needs one, add it as a "secret" input field rather than embedding a fake value.`;

/**
 * Turns a pasted post into a draft skill proposal for the user to review
 * before saving. Uses Claude to extract structure when an API key is
 * configured; otherwise falls back to a conservative heuristic so the flow
 * still works, but flags the result as needing manual review.
 */
export async function parseSkillPost(postContent: string): Promise<SkillDraftProposal> {
  if (isClaudeConfigured()) {
    try {
      return await parseWithClaude(postContent);
    } catch (err) {
      // Fall through to the heuristic parser rather than failing the whole
      // onboarding flow — the user still gets an editable draft to work from.
      return {
        ...heuristicParse(postContent),
        reviewNote:
          "AI-assisted parsing failed (" +
          (err instanceof Error ? err.message : "unknown error") +
          "). This draft was produced heuristically — please review every field.",
      };
    }
  }

  return heuristicParse(postContent);
}

async function parseWithClaude(postContent: string): Promise<SkillDraftProposal> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: postContent }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const jsonText = stripCodeFence(text);
  const parsed = JSON.parse(jsonText);

  return {
    name: String(parsed.name ?? "Untitled skill"),
    description: String(parsed.description ?? ""),
    promptTemplate: String(parsed.promptTemplate ?? postContent),
    needsInput: Boolean(parsed.needsInput),
    usesCowork: Boolean(parsed.usesCowork),
    inputSchema: normalizeInputSchema(parsed.inputSchema),
    group: typeof parsed.group === "string" && parsed.group.trim() ? parsed.group.trim() : null,
    tags: normalizeTags(parsed.tags),
    needsReview: false,
  };
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim().toLowerCase())
    .slice(0, 6);
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text;
}

function normalizeInputSchema(raw: unknown): InputField[] {
  if (!Array.isArray(raw)) return [];
  const allowedTypes = new Set(["text", "textarea", "secret", "url", "number"]);
  return raw
    .filter((f) => f && typeof f === "object" && typeof f.key === "string")
    .map((f) => ({
      key: f.key,
      label: typeof f.label === "string" ? f.label : f.key,
      type: allowedTypes.has(f.type) ? f.type : "text",
      required: Boolean(f.required),
      placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
      helpText: typeof f.helpText === "string" ? f.helpText : undefined,
    }));
}

const COWORK_HINTS = ["cowork", "co-work", "claude cowork"];
const INPUT_HINTS = [
  "{{",
  "insira",
  "informe",
  "cole aqui",
  "your ",
  "fill in",
  "preencha",
  "replace with",
  "[insert",
];

/**
 * No-AI fallback: makes a best-effort, conservative draft from the raw post
 * text so the onboarding flow keeps working even without an API key. Always
 * marked needsReview so the dashboard makes clear it wasn't machine-verified.
 */
function heuristicParse(postContent: string): SkillDraftProposal {
  const trimmed = postContent.trim();
  const firstLine = trimmed.split("\n").find((l) => l.trim().length > 0) ?? trimmed;
  const name = firstLine.replace(/^["'#>\s-]+/, "").slice(0, 70) || "New skill";
  const lower = trimmed.toLowerCase();

  const usesCowork = COWORK_HINTS.some((hint) => lower.includes(hint));
  const needsInput = INPUT_HINTS.some((hint) => lower.includes(hint));

  const placeholderMatches = Array.from(trimmed.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)).map(
    (m) => m[1]
  );
  const inputSchema: InputField[] = Array.from(new Set(placeholderMatches)).map((key) => ({
    key,
    label: key.replace(/[_-]/g, " "),
    type: "text",
    required: true,
  }));

  return {
    name,
    description: trimmed.slice(0, 280),
    promptTemplate: trimmed,
    needsInput: needsInput || inputSchema.length > 0,
    usesCowork,
    inputSchema,
    group: null,
    tags: [],
    needsReview: true,
    reviewNote:
      "ANTHROPIC_API_KEY isn't configured, so this draft was built with a simple " +
      "heuristic instead of AI. Double-check the name, description, prompt and " +
      "input fields before saving.",
  };
}
