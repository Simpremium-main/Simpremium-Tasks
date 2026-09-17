import Anthropic from "@anthropic-ai/sdk";
import { uploadExecutionFile } from "./data";
import { sumTokenUsage } from "./cost";
import type { DispatchResult, DispatchStatus, ExecutionFile, TokenUsage } from "./types";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = "claude-sonnet-5";
const CODE_EXECUTION_BETA = "code-execution-2025-08-25";

// Vercel's own ceiling for a single function invocation is 300s (see
// maxDuration on the run routes). The Claude call itself isn't the only
// thing that takes time after it starts — collectGeneratedFiles below still
// has to download every generated file from Anthropic and upload it to
// Supabase Storage before this function can return anything. Budgeting
// 240s for the model call and 45s for file collection leaves real headroom
// under 300s for that plus JSON/SSE/DB overhead, so a genuinely slow chunk
// fails cleanly through this file's own error handling (recorded, visible,
// retryable) instead of Vercel hard-killing the process mid-flight — which
// leaves no chance for anything here to run, including the DB write that's
// supposed to guarantee every execution gets recorded (see
// withFailureRecorded in lib/runSkill.ts and the security baseline in
// CLAUDE.md: even a failed run must leave a trace, not sit "running"
// forever with nothing watching it).
const CHUNK_TIMEOUT_MS = 240_000;
const FILE_COLLECTION_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Claude gets real tools here, the same way it does in the Claude.ai
 * dashboard: code execution (a sandbox with reportlab/openpyxl/pandas/
 * matplotlib/python-docx/python-pptx available, so it can actually write and
 * run code that produces a real .pdf/.csv/.xlsx/.docx/.pptx — not markdown
 * text this app then wraps in a document shell) and web search (for
 * research-flavored skills). Which tool a given run actually uses, if any,
 * is entirely up to Claude — a plain text-answer skill just answers with
 * text, same as before.
 */
const SKILL_EXECUTION_SYSTEM_PROMPT = `Você está rodando como o motor de execução de uma skill automatizada dentro de um painel (Skills Hub), não numa conversa com um humano em tempo real.

- Você tem acesso a duas ferramentas reais: execução de código (um sandbox com bibliotecas como reportlab, openpyxl, pandas, matplotlib, python-docx e python-pptx já instaladas) e busca na web.
- Se a tarefa pedir um arquivo de verdade — PDF, planilha (CSV/XLSX), DOCX, PPTX, imagem, etc. — escreva e rode código para gerar esse arquivo de verdade usando a ferramenta de execução de código. Nunca escreva markdown ou texto fingindo que é o conteúdo de um PDF/planilha — gere o arquivo real. O painel baixa o arquivo que você gerar e disponibiliza pra download.
- Se a tarefa pedir pesquisa, informação atual, ou dados que você não tem certeza, use a busca na web antes de responder.
- Se a tarefa só pedir um texto, resposta ou explicação (sem arquivo nenhum envolvido), responda diretamente com o texto — não gere um arquivo à toa.
- Não adicione ressalvas, comentários sobre suas limitações, ofertas de ajuda adicional ou perguntas de acompanhamento — ninguém está lendo isso em tempo real pra responder de volta.
- Quando não gerar arquivo, a resposta inteira deve ser o resultado da tarefa, exatamente como deve ficar — nada antes, nada depois.`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "code_execution_20260521", name: "code_execution" },
  { type: "web_search_20260209", name: "web_search" },
];

/**
 * Marks a cache breakpoint on the last content block of the last message —
 * Anthropic caches everything up to that point, so the next chunk of a
 * multi-request run (which resends this exact array unchanged, plus new
 * turns — see lib/runSkill.ts's advance()) reads the whole prior
 * conversation from cache (~10% of the normal input price) instead of
 * paying full price to resend it, which is what made a long multi-chunk
 * run cost roughly the square of its length before this. A no-op, not an
 * error, if the cached span is too small to qualify (Anthropic's own
 * per-model minimum) — this only ever saves money, never costs correctness.
 * Doesn't mutate `messages`: the caller still feeds the plain array forward
 * into conversationState/newMessages, so cache_control markers don't pile
 * up across chunks.
 */
function withCacheBreakpoint(
  messages: Anthropic.Beta.BetaMessageParam[]
): Anthropic.Beta.BetaMessageParam[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const cacheControl = { type: "ephemeral" as const };

  if (typeof last.content === "string") {
    return [
      ...messages.slice(0, -1),
      { ...last, content: [{ type: "text", text: last.content, cache_control: cacheControl }] },
    ];
  }

  if (last.content.length === 0) return messages;
  const lastBlockIndex = last.content.length - 1;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      content: last.content.map((block, i) =>
        i === lastBlockIndex ? { ...block, cache_control: cacheControl } : block
      ),
    },
  ];
}

function extractText(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Downloads every file a code-execution turn produced and uploads each one
 * into this app's own Supabase Storage bucket, so the execution's files
 * outlive whatever retention Anthropic's Files API applies on its side.
 */
async function collectGeneratedFiles(
  anthropic: Anthropic,
  content: Anthropic.Beta.BetaContentBlock[]
): Promise<ExecutionFile[]> {
  const files: ExecutionFile[] = [];

  for (const block of content) {
    if (block.type !== "bash_code_execution_tool_result") continue;
    const result = block.content;
    if (result.type !== "bash_code_execution_result" || !result.content) continue;

    for (const fileRef of result.content) {
      if (fileRef.type !== "bash_code_execution_output") continue;

      const metadata = await anthropic.beta.files.retrieveMetadata(fileRef.file_id);
      const downloadResponse = await anthropic.beta.files.download(fileRef.file_id);
      const bytes = Buffer.from(await downloadResponse.arrayBuffer());

      const safeName = (metadata.filename || fileRef.file_id).replace(/[/\\]/g, "_");
      const storagePath = `${fileRef.file_id}/${safeName}`;
      const mimeType = metadata.mime_type || "application/octet-stream";

      await uploadExecutionFile(storagePath, bytes, mimeType);
      files.push({ name: safeName, storagePath, mimeType, sizeBytes: bytes.length });
    }
  }

  return files;
}

export interface ClaudeChunkResult {
  /** false when the turn paused (Claude's own server-tool iteration cap, or
   *  this chunk's own time budget) and needs another request to continue. */
  done: boolean;
  /** Full conversation so far, including this chunk's assistant turn — feed
   *  this straight back in as `messages` for the next chunk. */
  messages: Anthropic.Beta.BetaMessageParam[];
  files: ExecutionFile[];
  result?: string;
  status?: DispatchStatus;
  error?: string;
  /** This one chunk's own token usage — null when the call never reached
   *  Anthropic (e.g. no API key configured). */
  usage: TokenUsage | null;
}

/**
 * Runs exactly one HTTP call to Claude — the core primitive both the
 * single-shot and chunked (multi-request) dispatch paths below build on.
 * Bounded to CHUNK_TIMEOUT_MS so a slow chunk fails as a clean, recorded
 * error rather than the whole process getting hard-killed by the platform.
 */
export async function dispatchClaudeChunk(
  messages: Anthropic.Beta.BetaMessageParam[],
  onDelta: (chunk: string) => void
): Promise<ClaudeChunkResult> {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      done: true,
      messages,
      files: [],
      usage: null,
      status: "needs_setup",
      error: "ANTHROPIC_API_KEY isn't set, so this skill can't be run yet. Add it to your environment to enable it.",
    };
  }

  try {
    const stream = anthropic.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        // Cached: this system prompt is byte-identical on every single call,
        // across every skill and every chunk, so it's the cheapest possible
        // cache breakpoint to add — cost only if/once it clears Anthropic's
        // per-model minimum cacheable length.
        system: [
          { type: "text", text: SKILL_EXECUTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        // display: "summarized" — without it, Sonnet 5 defaults to
        // "omitted" (thinking still happens and is billed, but the delta
        // text is empty), so a task that spends a while thinking before its
        // first visible token showed no progress at all: the run panel sat
        // on "Aguardando a primeira resposta…" looking stuck even on a
        // perfectly healthy run.
        thinking: { type: "adaptive", display: "summarized" },
        tools: TOOLS,
        betas: [CODE_EXECUTION_BETA],
        messages: withCacheBreakpoint(messages),
      },
      { timeout: CHUNK_TIMEOUT_MS }
    );
    stream.on("text", (delta) => onDelta(delta));
    stream.on("thinking", (delta) => onDelta(delta));
    const message = await stream.finalMessage();

    const newMessages: Anthropic.Beta.BetaMessageParam[] = [
      ...messages,
      { role: "assistant", content: message.content },
    ];
    const files = await withTimeout(
      collectGeneratedFiles(anthropic, message.content),
      FILE_COLLECTION_TIMEOUT_MS,
      "Generating this chunk's files took too long and was stopped rather than risk the whole " +
        "run getting hard-killed by the platform with nothing recorded."
    );
    const usage: TokenUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? undefined,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? undefined,
    };

    if (message.stop_reason === "pause_turn") {
      return { done: false, messages: newMessages, files, usage };
    }
    if (message.stop_reason === "refusal") {
      return { done: true, messages: newMessages, files, usage, status: "error", error: "Claude refused to run this prompt." };
    }

    return { done: true, messages: newMessages, files, usage, result: extractText(message.content), status: "success" };
  } catch (err) {
    return {
      done: true,
      messages,
      files: [],
      usage: null,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error calling Claude",
    };
  }
}

// Best-effort cap for the non-streaming, single-request path below, which
// (unlike lib/runSkill.ts's chunked flow) can't hand a "still running,
// continue" state back across separate HTTP requests — it has to finish or
// give up within this one call.
const SINGLE_CALL_MAX_CHUNKS = 3;

/**
 * Runs a skill's assembled prompt directly against the Claude API in one
 * blocking call. Used by the plain JSON run route for callers that don't
 * want to deal with SSE/continuation — bounded to a few chunks internally,
 * so a task heavy enough to need real multi-request continuation should go
 * through the streaming run panel instead (lib/runSkill.ts's chunked flow),
 * not this endpoint.
 */
export async function dispatchToClaude(prompt: string): Promise<DispatchResult> {
  let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let files: ExecutionFile[] = [];
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (let i = 0; i < SINGLE_CALL_MAX_CHUNKS; i++) {
    const chunk = await dispatchClaudeChunk(messages, () => {});
    messages = chunk.messages;
    files = [...files, ...chunk.files];
    if (chunk.usage) usage = sumTokenUsage(usage, chunk.usage);
    if (chunk.done) {
      return { status: chunk.status!, result: chunk.result, error: chunk.error, files, usage };
    }
  }

  return {
    status: "error",
    error:
      "This task needed more steps than a single request allows here — run it from the skill's " +
      "page instead, which can continue automatically across multiple requests.",
    files,
    usage,
  };
}
