#!/usr/bin/env node
/**
 * Required for Cowork jobs to report back at all — see mac-agent/README.md's
 * "How results get back — via MCP, no local file" section for setup.
 *
 * A minimal MCP server exposing exactly one tool, report_cowork_result,
 * that POSTs a finished task's outcome straight to the Skills Hub
 * dashboard's own POST /api/cowork-agent/report-result. mac-agent/agent.js's
 * driveCowork() tells every Cowork task to call this tool directly as its
 * very last step — there's no local-file fallback, so this server has to
 * actually be configured and reachable for a job to ever finish.
 *
 * Deliberately scoped to this one job, not a general bash/HTTP tool — the
 * task's own prompt never needs to see COWORK_AGENT_TOKEN at all, it just
 * calls the tool with the execution's outcome; the token lives only in
 * this process's environment (set in claude_desktop_config.json, see the
 * README).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DASHBOARD_URL = (process.env.DASHBOARD_URL ?? "").replace(/\/+$/, "");
const COWORK_AGENT_TOKEN = process.env.COWORK_AGENT_TOKEN ?? "";

if (!DASHBOARD_URL || !COWORK_AGENT_TOKEN) {
  console.error(
    "[report-result-mcp] Faltam DASHBOARD_URL e/ou COWORK_AGENT_TOKEN nas variáveis de ambiente " +
      "desse servidor MCP — configure o bloco \"env\" dele em claude_desktop_config.json (veja " +
      "mac-agent/README.md, \"Reportando resultado via MCP\")."
  );
  process.exit(1);
}

const ReportResultSchema = z
  .object({
    executionId: z
      .string()
      .describe("O ID da execução, exatamente como foi informado no início do prompt da tarefa"),
    status: z
      .enum(["success", "error", "needs_setup"])
      .describe("Resultado final da tarefa: success (terminou), error (falhou), needs_setup (faltou alguma configuração)"),
    result: z
      .string()
      .optional()
      .describe("A resposta final completa da tarefa — obrigatório quando status é 'success'"),
    error: z
      .string()
      .optional()
      .describe("O que deu errado, em detalhe — obrigatório quando status é 'error' ou 'needs_setup'"),
    files: z
      .array(
        z.object({
          name: z.string().describe("Nome do arquivo, com extensão (ex: 'estatisticas-donk.xlsx')"),
          mimeType: z.string().describe("MIME type do arquivo"),
          contentBase64: z.string().describe("O conteúdo binário do arquivo, codificado em base64"),
        })
      )
      .optional()
      .describe(
        "Se a tarefa gerou algum arquivo real (planilha, PDF, etc.), inclua aqui — o dashboard só " +
          "guarda o arquivo se ele vier nesse campo, não basta descrevê-lo no texto do result."
      ),
  })
  .strict();

const server = new McpServer({ name: "skills-hub-report-result", version: "1.0.0" });

server.registerTool(
  "report_cowork_result",
  {
    title: "Reportar resultado de uma tarefa do Skills Hub",
    description:
      "Chame essa ferramenta UMA ÚNICA VEZ, como último passo da tarefa, pra entregar o resultado " +
      "final direto pro dashboard Skills Hub. Use o executionId exatamente como foi informado no " +
      "início do prompt. Se a tarefa gerou um arquivo real (planilha, PDF, etc.), inclua seu " +
      "conteúdo em base64 no campo 'files' — só descrever o arquivo no texto do result não é " +
      "suficiente pra ele aparecer no dashboard.",
    inputSchema: ReportResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ executionId, status, result, error, files }) => {
    try {
      const res = await fetch(`${DASHBOARD_URL}/api/cowork-agent/report-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${COWORK_AGENT_TOKEN}` },
        body: JSON.stringify({ executionId, status, result, error, files }),
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Falha ao reportar (HTTP ${res.status}): ${text.slice(0, 500)}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: "Resultado reportado com sucesso pro Skills Hub." }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Erro de rede reportando o resultado: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
