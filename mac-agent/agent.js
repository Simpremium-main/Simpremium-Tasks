#!/usr/bin/env node
"use strict";

/**
 * Cowork dispatch agent — polls the Skills Hub dashboard for queued Cowork
 * jobs and drives Claude Desktop's Cowork feature locally through
 * AppleScript, since there's no official API/webhook to trigger Cowork
 * (see lib/cowork.ts in the main repo for the full reasoning, and
 * README.md in this folder before running this for the first time).
 *
 * Runs forever in a simple poll loop — no inbound networking needed on
 * this machine, it only ever calls out to the dashboard. Requires Node 18+
 * (uses the built-in `fetch`) and macOS (`osascript`).
 */

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG = loadConfig();

function loadConfig() {
  // A minimal KEY=VALUE parser for a local .env file next to this script
  // — no dependency on the `dotenv` package, so this agent runs with
  // nothing but `node agent.js`. Falls back to real environment variables
  // (e.g. set via launchd's EnvironmentVariables) for anything not in the
  // file.
  const envPath = path.join(__dirname, ".env");
  const fileVars = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      fileVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  // Deliberately `||`, not `??`: a blank value left after the `=` in a
  // copied .env.example parses to an empty string, not undefined — `??`
  // would keep that empty string instead of falling back to the default
  // (this exact gap once broke a since-removed local-results-dir setting
  // with a `mkdir ''` crash). None of these values are meant to
  // legitimately be "", so treating blank the same as unset is always
  // what's wanted here.
  const get = (key, fallback) => fileVars[key] || process.env[key] || fallback;

  const dashboardUrl = get("DASHBOARD_URL");
  const token = get("COWORK_AGENT_TOKEN");
  if (!dashboardUrl || !token) {
    console.error(
      "Faltam DASHBOARD_URL e/ou COWORK_AGENT_TOKEN. Copie .env.example para .env nesta pasta " +
        "e preencha os dois antes de rodar (o token precisa ser o mesmo valor configurado como " +
        "COWORK_AGENT_TOKEN nas variáveis de ambiente do dashboard na Vercel)."
    );
    process.exit(1);
  }

  return {
    dashboardUrl: dashboardUrl.replace(/\/+$/, ""),
    token,
    pollIntervalMs: Number(get("POLL_INTERVAL_MS", "15000")),
    resultTimeoutMs: Number(get("RESULT_TIMEOUT_MS", String(20 * 60 * 1000))),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Leave json null — the res.ok check below decides whether to throw,
    // and falls back to the raw text for the error message either way.
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${url}: ${json?.error ?? text.slice(0, 300)}`);
  }
  return json;
}

async function fetchNextJob() {
  const data = await fetchJson(`${CONFIG.dashboardUrl}/api/cowork-agent/next-job`, {
    headers: { Authorization: `Bearer ${CONFIG.token}` },
  });
  return data?.job ?? null;
}

async function reportResult(executionId, outcome) {
  await fetchJson(`${CONFIG.dashboardUrl}/api/cowork-agent/report-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}` },
    body: JSON.stringify({ executionId, ...outcome }),
  });
}

// Two things can finalize the same execution in a genuine (if unlikely)
// race — this agent's own catch-block error report, and the MCP tool
// reporting first. When that happens the server correctly rejects the
// second attempt; treat it as informational instead of retrying/erroring
// loudly.
function isAlreadyFinalizedError(err) {
  return err instanceof Error && /HTTP 404/.test(err.message);
}

// Polled while waiting for a job to finish — the only way this agent
// learns a Cowork task is done, now that reporting happens via the
// report_cowork_result MCP tool calling the dashboard directly instead of
// this agent reading a local file. Best-effort: a failed check just means
// one more 5s tick before the next attempt.
async function checkExecutionStatus(executionId) {
  try {
    const data = await fetchJson(
      `${CONFIG.dashboardUrl}/api/cowork-agent/execution-status?id=${encodeURIComponent(executionId)}`,
      { headers: { Authorization: `Bearer ${CONFIG.token}` } }
    );
    return data?.status ?? null;
  } catch {
    return null;
  }
}

// Best-effort, like the dashboard's own agent-seen heartbeat — lets the UI
// show "Cowork trabalhando nisso há Xm" instead of a generic "running" that
// could just as easily mean "still sitting in the queue". A failure here
// should never stop the actual job from running.
async function markStarted(executionId) {
  try {
    await fetchJson(`${CONFIG.dashboardUrl}/api/cowork-agent/mark-started`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}` },
      body: JSON.stringify({ executionId }),
    });
  } catch (err) {
    console.error("[cowork-agent] Falha ao marcar início (não bloqueia a tarefa):", err instanceof Error ? err.message : err);
  }
}

function runAppleScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    execFile("osascript", [scriptPath, ...args], (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Drives Claude Desktop's Cowork feature to actually work on `prompt`.
 * The AppleScript step is confirmed working (tested against a real Mac
 * mini) — see README.md's "Testar o AppleScript" section if it ever stops
 * matching Cowork's UI after a Claude Desktop update.
 *
 * Wraps the skill's own prompt with a reporting instruction telling Cowork
 * to call report_cowork_result (mac-agent/mcp-report-result/) with this
 * exact executionId — see README.md's "Reportando resultado via MCP"
 * section for how that's set up in Claude Desktop. Deliberately MCP-only,
 * no local-file fallback: this agent no longer reads or watches any
 * results file at all.
 *
 * The instruction is stated BOTH before and after the skill's own prompt,
 * not just appended at the end — a real skill prompt (e.g. a multi-step
 * browser-automation task) can run to several thousand words, and a report
 * from production showed the file/steps/screenshot requirements getting
 * dropped when they only appeared once, after all of that (see README's
 * "Step-by-step and browser screenshots" section). This is a best-effort
 * mitigation, not a guarantee — whether Cowork actually complies is still
 * entirely up to the model, same caveat as before.
 *
 * `pid`, when given, drives that exact Claude Desktop process instead of
 * the default one found by name — see Skill.accountSplit / this file's
 * findRunningInstancePid(). UNVERIFIED, unlike the rest of this function.
 */
async function driveCowork(executionId, prompt, pid) {
  const reportingRules =
    `Ao final desta tarefa você DEVE chamar a ferramenta MCP "report_cowork_result" com ` +
    `executionId "${executionId}" — nunca termine sem chamar essa ferramenta, mesmo se a tarefa ` +
    `falhar. Três coisas que essa chamada precisa carregar sempre que se aplicarem, não são ` +
    `opcionais: (1) se o resultado final é uma tabela ou lista de dados estruturados (várias ` +
    `linhas com as mesmas colunas), inclua também um arquivo real com esses dados (.xlsx de ` +
    `preferência, .csv se não conseguir gerar .xlsx) no campo "files" — uma tabela markdown sozinha ` +
    `no texto do result NÃO é suficiente, isso vale sempre que o resultado for tabular, não só ` +
    `quando o prompt pedir uma "planilha" com essas palavras; (2) se você tirou prints de tela do ` +
    `navegador durante a tarefa e realmente tem acesso a eles como arquivo, inclua cada um também ` +
    `em "files" (mimeType "image/png" ou "image/jpeg", name descritivo tipo ` +
    `"passo-2-resultados-busca.png") — nunca invente ou simule um print que você não tem de verdade; ` +
    `(3) preencha "steps" com o passo a passo real do que você foi fazendo, em ordem, um item curto ` +
    `e concreto por passo (ex: "Abri a página X", "Cliquei em Y", "Extraí os dados Z").`;

  const fullPrompt =
    `${reportingRules}\n\n---\n\n${prompt}\n\n---\n\nLembrete: quando terminar essa tarefa, chame ` +
    `"report_cowork_result" com executionId "${executionId}", status "success" e result igual à ` +
    `sua resposta final completa (sem comentário adicional) — e não esqueça de incluir "files" ` +
    `(arquivo real + prints de tela, se aplicável) e "steps", exatamente como descrito no início ` +
    `desta mensagem. Se a tarefa gerou algum arquivo real, NÃO chame de "enviado" sem mais — inclua ` +
    `o conteúdo em base64 no campo "files" dessa mesma chamada (name, mimeType e contentBase64); sem ` +
    `isso o arquivo fica só nessa conversa e não chega no dashboard. Se a tarefa falhar ou faltar ` +
    `alguma configuração pra completá-la, chame a mesma ferramenta com status "error" (ou ` +
    `"needs_setup", se for falta de configuração) e error explicando o que aconteceu.`;

  const promptFile = path.join(os.tmpdir(), `cowork-prompt-${executionId}.txt`);
  fs.writeFileSync(promptFile, fullPrompt, "utf8");

  try {
    const args = pid ? [promptFile, String(pid)] : [promptFile];
    await runAppleScript(path.join(__dirname, "drive-cowork.applescript"), args);
  } finally {
    fs.rmSync(promptFile, { force: true });
  }
}

/**
 * Cowork's browser is built into Claude Desktop itself, isolated from the
 * system browser (confirmed against Anthropic's own docs — "The built-in
 * browser is separate from your own browser. Claude doesn't see your saved
 * logins unless you choose to import them"), and holds one persistent login
 * per site with no exposed way to select which account a task uses within a
 * single instance. An earlier version of this file tried switching a
 * *system* Chrome profile before driving Cowork — that did nothing, since
 * Cowork's browser has no relationship to system Chrome at all. Then it
 * tried pausing and asking a human to switch accounts inside Cowork's
 * browser panel between jobs — correct, but fully manual, every time the
 * account changed.
 *
 * UNVERIFIED (never run against a real Mac), but grounded in a documented
 * Electron mechanism rather than another assumption: Claude Desktop is an
 * Electron app, and Electron apps support `--user-data-dir` to run a fully
 * isolated instance (own login, own local storage, own Cowork browser
 * session) alongside the default one. Run one instance per account —
 *
 *   open -n -a "Claude.app" --args --user-data-dir="$HOME/.claude-instances/<id>"
 *
 * — log into Cowork there once, and leave it running; do the same for each
 * other account with a different <id>. Each stays permanently logged into
 * its own account, so there's nothing to switch at run time anymore.
 *
 * findRunningInstancePid() finds the real process id of an already-running
 * instance by reading `ps` output and matching its `--user-data-dir` flag —
 * deliberately NOT by asking AppleScript to enumerate "the Nth process
 * named Claude" (process order isn't guaranteed stable across relaunches),
 * and deliberately NOT auto-launching a missing instance (a freshly
 * launched one isn't logged in yet, so silently launching one would just
 * fail the task in a more confusing way) — returns null when the account's
 * instance isn't found running, and processJob below turns that into a
 * clear, actionable error instead of guessing.
 */
const CLAUDE_INSTANCES_DIR = path.join(os.homedir(), ".claude-instances");

function userDataDirFor(instanceId) {
  return path.join(CLAUDE_INSTANCES_DIR, instanceId);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findRunningInstancePid(instanceId) {
  const userDataDir = userDataDirFor(instanceId);
  const stdout = await new Promise((resolve, reject) => {
    execFile("ps", ["-eo", "pid=,command="], { maxBuffer: 10 * 1024 * 1024 }, (err, out, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(out);
    });
  });

  // A plain substring check on --user-data-dir=<path> is wrong when one
  // instance id is a prefix of another (the exact example in this file's
  // own README/UI placeholder: "mundo" and "mundo2") — ".../mundo" is a
  // literal substring of ".../mundo2", so a naive `includes()` check would
  // match the WRONG account's process and silently drive Cowork on it,
  // defeating the entire point of this feature. Requiring a boundary
  // (quote, whitespace, or end of line) right after the path rules that
  // out — "mundo2"'s line has "2" there instead, so it never matches.
  const boundary = new RegExp(`--user-data-dir=["']?${escapeRegExp(userDataDir)}(?:["']|\\s|$)`);

  // Electron passes --user-data-dir to every child process of an instance
  // (renderer, gpu-process, utility, ...), not just the main one — matching
  // whichever line happens to come first in `ps` output risks targeting a
  // background helper process instead of the actual app, which System
  // Events can't meaningfully bring to the front the same way. The main
  // process is the one launched without a `--type=...` flag, so it's
  // preferred whenever present; only falls back to any match (better than
  // nothing) if that line somehow isn't found.
  let fallbackPid = null;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!boundary.test(trimmed)) continue;
    const pid = trimmed.split(/\s+/)[0];
    if (!pid) continue;
    if (!trimmed.includes("--type=")) return pid;
    if (!fallbackPid) fallbackPid = pid;
  }
  return fallbackPid;
}

// The only way this agent learns a job is done: poll the execution's
// status until report_cowork_result (called by Cowork itself) has moved it
// off "running", or give up at the timeout.
async function waitForCompletion(executionId) {
  const deadline = Date.now() + CONFIG.resultTimeoutMs;
  while (Date.now() < deadline) {
    const status = await checkExecutionStatus(executionId);
    if (status && status !== "running") return true;
    await sleep(5000);
  }
  return false;
}

async function processJob(job) {
  console.log(
    `[cowork-agent] Peguei a tarefa da skill "${job.skillName}" (execução ${job.executionId})` +
      (job.accountLabel ? ` — conta "${job.accountLabel}"` : "")
  );
  await markStarted(job.executionId);
  try {
    let targetPid;
    if (job.claudeInstance) {
      targetPid = await findRunningInstancePid(job.claudeInstance);
      if (!targetPid) {
        throw new Error(
          `A instância do Claude Desktop da conta "${job.accountLabel}" não está rodando/logada. ` +
            `Abra com: open -n -a "Claude.app" --args --user-data-dir="${userDataDirFor(job.claudeInstance)}" ` +
            `— faça login no Cowork nela e rode essa skill de novo.`
        );
      }
      console.log(`[cowork-agent] Instância da conta "${job.accountLabel}" encontrada — pid ${targetPid}`);
    }
    await driveCowork(job.executionId, job.prompt, targetPid);
    console.log(`[cowork-agent] Cowork disparado, aguardando o report via MCP (report_cowork_result)...`);
    const done = await waitForCompletion(job.executionId);
    if (done) {
      console.log("[cowork-agent] Execução finalizada via MCP.");
    } else {
      console.log("[cowork-agent] Cowork não chamou report_cowork_result dentro do tempo esperado — reportando erro");
      await reportResult(job.executionId, {
        status: "error",
        error:
          "O Cowork não chamou a ferramenta MCP report_cowork_result dentro do tempo esperado. " +
          "Confira se o servidor MCP (mac-agent/mcp-report-result) está configurado no Claude " +
          "Desktop e se o app foi reiniciado depois da configuração (veja mac-agent/README.md).",
      });
    }
  } catch (err) {
    console.error("[cowork-agent] Falha ao processar a tarefa:", err);
    // Always report back — the execution row is already "running" and
    // waiting; a silent crash here would leave it stuck forever instead
    // of a normal recorded error, breaking the "every attempt gets
    // recorded, even failures" rule the whole dashboard follows. Unless
    // it's already finalized (MCP got there first) — that's not a failure
    // to report, just a race this agent lost.
    if (isAlreadyFinalizedError(err)) {
      console.log("[cowork-agent] Essa execução já tinha sido finalizada (provavelmente via MCP) — ignorando.");
      return;
    }
    try {
      await reportResult(job.executionId, {
        status: "error",
        error: err instanceof Error ? err.message : "Falha desconhecida no agente do Mac mini",
      });
    } catch (reportErr) {
      if (isAlreadyFinalizedError(reportErr)) {
        console.log("[cowork-agent] Essa execução já tinha sido finalizada (provavelmente via MCP) — ignorando.");
      } else {
        console.error(
          "[cowork-agent] Além de falhar, não consegui nem reportar o erro pro dashboard:",
          reportErr
        );
      }
    }
  }
}

async function main() {
  console.log(
    `[cowork-agent] Rodando — consultando ${CONFIG.dashboardUrl} a cada ${CONFIG.pollIntervalMs}ms`
  );
  for (;;) {
    console.log(`[cowork-agent] Consultando ${CONFIG.dashboardUrl}/api/cowork-agent/next-job...`);
    try {
      const job = await fetchNextJob();
      if (job) {
        console.log(`[cowork-agent] Job recebido: ${JSON.stringify({ executionId: job.executionId, skillName: job.skillName, promptLen: job.prompt?.length ?? 0 })}`);
        await processJob(job);
        // Deliberately always sleeps below now, even after a job — this used
        // to `continue` straight into another poll "in case more jobs are
        // queued", but that fast path turned a broken/rejected report (e.g.
        // the server refusing an already-finalized execution) into a tight
        // loop hammering the dashboard many times a second with no delay at
        // all — confirmed from the dashboard's own request logs during a
        // real debugging session. A few seconds of extra latency between
        // chained jobs is a fine trade for never doing that again.
      } else {
        console.log("[cowork-agent] Nenhum job disponível agora.");
      }
    } catch (err) {
      console.error(
        "[cowork-agent] Falha ao consultar o dashboard:",
        err instanceof Error ? err.message : err
      );
    }
    await sleep(CONFIG.pollIntervalMs);
  }
}

// Last-resort safety net — everything in main()'s loop already has its own
// try/catch, so these should normally never fire. But if something slips
// past that (a bug in the error handling itself, a rejected promise nobody
// awaited), Node's default behavior is to print a stack trace and kill the
// whole process outright — which for a script meant to run unattended for
// days turns one edge case into total silence until someone notices the
// terminal isn't doing anything anymore. Logging and staying up is the
// right tradeoff here: the next poll cycle is a clean retry regardless of
// what just went wrong.
process.on("uncaughtException", (err) => {
  console.error("[cowork-agent] Exceção não tratada (o agente continua rodando):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[cowork-agent] Promise rejeitada sem tratamento (o agente continua rodando):", reason);
});

main();
