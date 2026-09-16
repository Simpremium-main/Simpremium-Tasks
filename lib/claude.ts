import Anthropic from "@anthropic-ai/sdk";
import { uploadExecutionFile } from "./data";
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
// maxDuration on the run routes) — keep each individual Claude call safely
// under that so a slow chunk fails cleanly (caught below, recorded as an
// error) instead of the whole process getting hard-killed by the platform
// with no chance for any of this file's error handling to run.
const CHUNK_TIMEOUT_MS = 280_000;

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
        system: SKILL_EXECUTION_SYSTEM_PROMPT,
        // display: "summarized" — without it, Sonnet 5 defaults to
        // "omitted" (thinking still happens and is billed, but the delta
        // text is empty), so a task that spends a while thinking before its
        // first visible token showed no progress at all: the run panel sat
        // on "Aguardando a primeira resposta…" looking stuck even on a
        // perfectly healthy run.
        thinking: { type: "adaptive", display: "summarized" },
        tools: TOOLS,
        betas: [CODE_EXECUTION_BETA],
        messages,
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
    const files = await collectGeneratedFiles(anthropic, message.content);
    const usage: TokenUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
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
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (let i = 0; i < SINGLE_CALL_MAX_CHUNKS; i++) {
    const chunk = await dispatchClaudeChunk(messages, () => {});
    messages = chunk.messages;
    files = [...files, ...chunk.files];
    if (chunk.usage) {
      usage.inputTokens += chunk.usage.inputTokens;
      usage.outputTokens += chunk.usage.outputTokens;
    }
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
