import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { getExecution, getSkill } from "@/lib/data";
import { finishExecution } from "@/lib/runSkill";
import type { DispatchStatus } from "@/lib/types";

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
const ReportResultSchema = z.object({
  executionId: z.string().describe("O ID da execução, exatamente como foi informado no início do prompt da tarefa"),
  status: z
    .enum(["success", "error", "needs_setup"])
    .describe("Resultado final da tarefa: success (terminou), error (falhou), needs_setup (faltou configuração)"),
  result: z.string().optional().describe("A resposta final completa — obrigatório quando status é 'success'"),
  error: z.string().optional().describe("O que deu errado, em detalhe — obrigatório quando status é 'error' ou 'needs_setup'"),
});

const handler = createMcpHandler((server) => {
  server.registerTool(
    "report_cowork_result",
    {
      title: "Reportar resultado de uma tarefa do Skills Hub",
      description:
        "Chame essa ferramenta UMA ÚNICA VEZ, como último passo da tarefa, pra entregar o resultado " +
        "final direto pro dashboard Skills Hub. Use o executionId exatamente como foi informado no " +
        "início do prompt.",
      inputSchema: ReportResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ executionId, status, result, error }) => {
      console.log(
        `[cowork-agent-server] mcp report_cowork_result chamado — executionId=${executionId}, status=${status}`
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

        const dispatchStatus = status as DispatchStatus;
        await finishExecution(skill, executionId, { status: dispatchStatus, result, error });
        console.log(`[cowork-agent-server] mcp: execução ${executionId} finalizada com status "${dispatchStatus}"`);
        return { content: [{ type: "text", text: "Resultado reportado com sucesso pro Skills Hub." }] };
      } catch (err) {
        const msg = `Erro ao reportar resultado: ${err instanceof Error ? err.message : String(err)}`;
        console.error("[cowork-agent-server] mcp report_cowork_result failed:", err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
});

async function verifyToken(_req: Request, bearerToken?: string) {
  const expected = process.env.COWORK_AGENT_TOKEN;
  if (!expected || !bearerToken || bearerToken !== expected) return undefined;
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
