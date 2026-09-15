import Anthropic from "@anthropic-ai/sdk";
import { uploadExecutionFile } from "./data";
import type { DispatchResult, ExecutionFile } from "./types";

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

/**
 * Runs a skill's assembled prompt directly against the Claude API. Used for
 * skills that don't depend on Cowork. Never fabricates a result: if no API
 * key is configured, it reports "needs_setup" instead.
 */
export async function dispatchToClaude(prompt: string): Promise<DispatchResult> {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      status: "needs_setup",
      error: "ANTHROPIC_API_KEY isn't set, so this skill can't be run yet. Add it to your environment to enable it.",
    };
  }

  try {
    let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
    let message: Anthropic.Beta.BetaMessage;

    // Server-side tools (code execution, web search) run entirely on
    // Anthropic's infrastructure within one call — no client-side tool loop
    // needed. The one exception is a long-running server-tool turn hitting
    // an internal iteration cap ("pause_turn"): resume it by re-sending the
    // paused assistant turn, per Anthropic's own documented pattern.
    for (let i = 0; i < 5; i++) {
      message = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SKILL_EXECUTION_SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        tools: TOOLS,
        betas: [CODE_EXECUTION_BETA],
        messages,
      });
      if (message.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: message.content }];
    }

    const files = await collectGeneratedFiles(anthropic, message!.content);
    return { status: "success", result: extractText(message!.content), files };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error calling Claude",
    };
  }
}

/**
 * Same as dispatchToClaude, but streams text as it arrives (calling onDelta
 * for each chunk) so the run panel can show the response building up live
 * instead of a blank "Rodando..." spinner until the whole thing lands.
 */
export async function streamDispatchToClaude(
  prompt: string,
  onDelta: (chunk: string) => void
): Promise<DispatchResult> {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      status: "needs_setup",
      error: "ANTHROPIC_API_KEY isn't set, so this skill can't be run yet. Add it to your environment to enable it.",
    };
  }

  try {
    let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
    let message: Anthropic.Beta.BetaMessage;

    for (let i = 0; i < 5; i++) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        system: SKILL_EXECUTION_SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        tools: TOOLS,
        betas: [CODE_EXECUTION_BETA],
        messages,
      });
      stream.on("text", (delta) => onDelta(delta));
      message = await stream.finalMessage();
      if (message.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: message.content }];
    }

    const files = await collectGeneratedFiles(anthropic, message!.content);
    return { status: "success", result: extractText(message!.content), files };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error calling Claude",
    };
  }
}
