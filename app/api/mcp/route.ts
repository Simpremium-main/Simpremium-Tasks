import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { getExecution, getSkill, uploadExecutionFile } from "@/lib/data";
import { finishExecution } from "@/lib/runSkill";
import type { DispatchStatus, ExecutionFile } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A remote MCP server hosted right on this same Vercel deployment, instead
 * of mac-agent/mcp-report-result/ running as a separate local process on
 * the Mac mini. Same one tool, report_cowork_result, same job — but
 * configuring it in Claude Desktop is just Settings → Connectors → a URL
 * and one header, no local Node process, no PATH/claude_desktop_config.json
 * issues to chase (that's exactly what today's setup kept running into).
 * mac-agent/agent.js's driveCowork() prompt instruction doesn't need to
 * change at all for this — it just tells Cowork to call a tool by name,
 * and doesn't care which MCP server (local or remote) actually serves it.
 *
 * Finalizes the execution in-process (the same finishExecution every other
 * dispatch path uses) instead of looping back through
 * POST /api/cowork-agent/report-result over HTTP — this route already IS
 * the server, so there's no reason to call itself.
 */
// Lets Cowork attach a real generated file (a spreadsheet, a PDF, ...) to
// the execution instead of only a text summary — before this, a Cowork
// task that produced a file (e.g. an .xlsx) only ever delivered it inside
// Cowork's own Claude Desktop conversation, invisible to the dashboard,
// because this tool had nowhere to put file bytes. base64 keeps it a plain
// JSON tool-call argument (no second upload endpoint/step for Cowork to
// juggle) — fine for the report/spreadsheet-sized files these skills
// produce; genuinely large files would need a different approach.
const ReportFileSchema = z.object({
  name: z.string().describe("Nome do arquivo, com extensão (ex: 'estatisticas-donk.xlsx')"),
  mimeType: z
    .string()
    .describe(
      "MIME type do arquivo (ex: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' para .xlsx, 'application/pdf' para PDF)"
    ),
  contentBase64: z.string().describe("O conteúdo binário do arquivo, codificado em base64"),
});

const ReportResultSchema = z.object({
  executionId: z.string().describe("O ID da execução, exatamente como foi informado no início do prompt da tarefa"),
  status: z
    .enum(["success", "error", "needs_setup"])
    .describe("Resultado final da tarefa: success (terminou), error (falhou), needs_setup (faltou configuração)"),
  result: z.string().optional().describe("A resposta final completa — obrigatório quando status é 'success'"),
  error: z.string().optional().describe("O que deu errado, em detalhe — obrigatório quando status é 'error' ou 'needs_setup'"),
  files: z
    .array(ReportFileSchema)
    .optional()
    .describe(
      "Se a tarefa gerou algum arquivo real (planilha, PDF, etc.), inclua aqui — o dashboard só " +
        "guarda o arquivo se ele vier nesse campo, não basta descrevê-lo no texto do result. " +
        "Também é aqui que vão prints de tela do navegador que você tirou durante a tarefa, se " +
        "tiver acesso a eles como arquivo (mimeType 'image/png' ou 'image/jpeg') — inclua um por " +
        "print, com um name descritivo tipo 'passo-2-resultados-busca.png'."
    ),
  steps: z
    .array(z.string())
    .optional()
    .describe(
      "O passo a passo do que você foi fazendo pra completar a tarefa, em ordem (ex: 'Abri a " +
        "página do jogador no HLTV.org', 'Cliquei na aba Stats', 'Copiei os números da tabela') — " +
        "cada item é um passo, curto e concreto. Separado do 'result' pra aparecer como uma lista " +
        "no dashboard, não misturado no texto."
    ),
});

const handler = createMcpHandler((server) => {
  server.registerTool(
    "report_cowork_result",
    {
      title: "Reportar resultado de uma tarefa do Skills Hub",
      description:
        "Chame essa ferramenta UMA ÚNICA VEZ, como último passo da tarefa, pra entregar o resultado " +
        "final direto pro dashboard Skills Hub. Use o executionId exatamente como foi informado no " +
        "início do prompt. Se a tarefa gerou um arquivo real (planilha, PDF, prints de tela, etc.), " +
        "inclua seu conteúdo em base64 no campo 'files' — só descrever o arquivo no texto do " +
        "result não é suficiente pra ele aparecer no dashboard. Preencha também 'steps' com o " +
        "passo a passo do que foi feito, em ordem.",
      inputSchema: ReportResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ executionId, status, result, error, files, steps }) => {
      console.log(
        `[cowork-agent-server] mcp report_cowork_result chamado — executionId=${executionId}, status=${status}, files=${files?.length ?? 0}`
      );
      try {
        const execution = await getExecution(executionId);
        if (!execution || execution.status !== "running") {
          const msg = `Execução ${executionId} não encontrada ou não está "running" (status atual: ${execution?.status ?? "inexistente"}).`;
          console.log(`[cowork-agent-server] mcp: ${msg}`);
          return { content: [{ type: "text", text: msg }], isError: true };
        }

        const skill = await getSkill(execution.skillId);
        if (!skill) {
          const msg = `Skill ${execution.skillId} não encontrada.`;
          console.log(`[cowork-agent-server] mcp: ${msg}`);
          return { content: [{ type: "text", text: msg }], isError: true };
        }

        let executionFiles: ExecutionFile[] | undefined;
        if (files && files.length) {
          executionFiles = [];
          for (const file of files) {
            const safeName = file.name.replace(/[/\\]/g, "_");
            const bytes = Buffer.from(file.contentBase64, "base64");
            const storagePath = `${executionId}/${safeName}`;
            await uploadExecutionFile(storagePath, bytes, file.mimeType);
            executionFiles.push({ name: safeName, storagePath, mimeType: file.mimeType, sizeBytes: bytes.length });
          }
        }

        const dispatchStatus = status as DispatchStatus;
        await finishExecution(skill, executionId, {
          status: dispatchStatus,
          result,
          error,
          files: executionFiles,
          steps,
        });
        console.log(
          `[cowork-agent-server] mcp: execução ${executionId} finalizada com status "${dispatchStatus}"` +
            (executionFiles?.length ? ` (${executionFiles.length} arquivo(s) salvos)` : "")
        );
        return { content: [{ type: "text", text: "Resultado reportado com sucesso pro Skills Hub." }] };
      } catch (err) {
        const msg = `Erro ao reportar resultado: ${err instanceof Error ? err.message : String(err)}`;
        console.error("[cowork-agent-server] mcp report_cowork_result failed:", err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
});

// A little forgiving on purpose: `mcp-handler` already strips one leading
// "Bearer " from the Authorization header before calling this, but some
// connector UIs' "Custom Header" mode adds that prefix themselves too,
// so pasting the token with "Bearer " already typed in front ends up
// sent as "Authorization: Bearer Bearer <token>" — stripping a second
// possible prefix (and trimming whitespace on both sides of the
// comparison) means that mismatch, or a stray newline from a copy-paste,
// doesn't turn into a confusing 401 with no way to tell why.
function normalizeToken(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, "").trim();
}

// Masks a secret for logging: first/last 4 chars + its length, enough to
// compare two values without ever writing either one out in full — same
// masking principle as everywhere else in this app secrets are involved.
function maskForLog(value: string): string {
  if (value.length <= 8) return `(${value.length} chars)`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

async function verifyToken(_req: Request, bearerToken?: string) {
  const expected = process.env.COWORK_AGENT_TOKEN;
  if (!expected) {
    console.log("[cowork-agent-server] mcp auth: COWORK_AGENT_TOKEN não está configurado no servidor");
    return undefined;
  }
  if (!bearerToken) {
    console.log("[cowork-agent-server] mcp auth: nenhum bearer token recebido na requisição");
    return undefined;
  }
  const normalizedReceived = normalizeToken(bearerToken);
  const normalizedExpected = normalizeToken(expected);
  if (normalizedReceived !== normalizedExpected) {
    console.log(
      `[cowork-agent-server] mcp auth: token não bateu — recebido ${maskForLog(normalizedReceived)}, esperado ${maskForLog(normalizedExpected)}`
    );
    return undefined;
  }
  return { token: bearerToken, scopes: [], clientId: "mac-agent" };
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

// mcp-handler doesn't set any CORS headers itself (confirmed against its
// own docs) — without this, a remote MCP client running in a browser-like
// context (Claude Desktop's connector UI, or claude.ai's web MCP client)
// can fail to connect at all: a request carrying a custom Authorization
// header triggers a CORS preflight (OPTIONS) first, and with no OPTIONS
// handler here Next.js has nothing to answer it with, so the browser never
// even sends the real request. `*` is fine here — this route requires its
// own bearer token regardless of origin, so open CORS doesn't loosen
// anything security-wise.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function corsHandler(req: Request): Promise<Response> {
  return withCors(await authHandler(req));
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export { corsHandler as GET, corsHandler as POST, corsHandler as DELETE };
