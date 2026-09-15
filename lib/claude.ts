import Anthropic from "@anthropic-ai/sdk";
import type { DispatchResult } from "./types";

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

/**
 * Claude has no way to attach a file to its response — it can only return
 * text. Without this, asking it to "generate a PDF" makes it answer like a
 * chat assistant explaining how you could make one yourself, which is
 * useless here: this app already turns a successful execution's text
 * result into a real downloadable .txt/.pdf (lib/exportResult.ts). Claude's
 * job is just to produce the content that belongs in that file — this
 * system prompt is what tells it that's the deal, instead of it guessing.
 */
const SKILL_EXECUTION_SYSTEM_PROMPT = `Você está rodando como o motor de execução de uma skill automatizada dentro de um painel (Skills Hub), não numa conversa com um humano em tempo real.

- Produza diretamente o conteúdo final que a instrução pede. Se pedirem um relatório, documento, texto ou "arquivo PDF", escreva o CONTEÚDO desse documento (texto/markdown limpo, pronto pra ser lido) — o painel converte sua resposta inteira em um arquivo .pdf/.txt baixável automaticamente depois de você responder. Nunca explique como a pessoa poderia gerar o arquivo ela mesma, nunca diga que "não consegue criar arquivos" — isso não é verdade aqui: você só precisa escrever o conteúdo, o painel cuida do resto.
- Não adicione ressalvas, comentários sobre suas limitações, ofertas de ajuda adicional ou perguntas de acompanhamento — ninguém está lendo isso em tempo real pra responder de volta.
- A resposta inteira deve ser o resultado da tarefa, exatamente como deve ficar no arquivo final — nada antes, nada depois.`;

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
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SKILL_EXECUTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return { status: "success", result: text };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error calling Claude",
    };
  }
}
