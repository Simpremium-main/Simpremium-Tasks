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
  // Deliberately `||`, not `??`: a line like `RESULTS_DIR=` left blank in a
  // copied .env.example (no value after the `=`) parses to an empty string,
  // not undefined — `??` would keep that empty string instead of falling
  // back to the default, which is exactly what broke driveCowork's
  // `mkdirSync(CONFIG.resultsDir, ...)` with `mkdir ''` (confirmed from a
  // real run's crash log). None of these values are meant to legitimately
  // be "", so treating blank the same as unset is always what's wanted here.
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
    resultsDir: get("RESULTS_DIR", path.join(os.homedir(), "CoworkAgent", "results")),
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

// Now that a job's result can also arrive via the MCP tool
// (mac-agent/mcp-report-result/) calling report-result directly, this
// agent's own attempt to report the same execution can legitimately lose
// that race — the server correctly rejects a report for an execution
// that's already finalized. That's not a real failure, just two paths
// converging; treat it as informational instead of retrying/erroring loudly.
function isAlreadyFinalizedError(err) {
  return err instanceof Error && /HTTP 404/.test(err.message);
}

// Lets waitForResult notice a job finished through the MCP tool instead of
// the results file, so it doesn't sit polling for up to RESULT_TIMEOUT_MS
// after the job is already done. Best-effort: a failed check just means
// the agent falls back to relying on the file/timeout, same as before this
// existed.
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
 * Appends an instruction telling Cowork how to report its answer back:
 * primarily by calling the report_cowork_result MCP tool
 * (mac-agent/mcp-report-result/) directly with this exact executionId —
 * see README.md's "Reportando resultado via MCP" section for how that's
 * set up in Claude Desktop. Falls back to the older file-drop convention
 * (saving to a known local path, which this agent still watches for via
 * waitForResult) for whenever that tool isn't available to it, so a job
 * never has literally no way to report back.
 */
async function driveCowork(executionId, prompt) {
  const resultPath = path.join(CONFIG.resultsDir, `${executionId}.txt`);
  fs.mkdirSync(CONFIG.resultsDir, { recursive: true });
  // Clean up any stale file from an earlier, unrelated attempt with the
  // same id (shouldn't normally happen — ids are unique — but avoids ever
  // reading a leftover file and reporting a false success).
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

  const fullPrompt =
    `${prompt}\n\n---\nQuando terminar essa tarefa, reporte o resultado assim: se você tiver ` +
    `acesso à ferramenta MCP "report_cowork_result", chame ela com executionId ` +
    `"${executionId}", status "success" e result igual à sua resposta final completa (sem ` +
    `comentário adicional). Se essa ferramenta NÃO estiver disponível pra você, em vez disso ` +
    `salve sua resposta final completa (só o conteúdo, sem comentário adicional) no arquivo ` +
    `"${resultPath}". Use só um dos dois métodos, nunca os dois.`;

  const promptFile = path.join(os.tmpdir(), `cowork-prompt-${executionId}.txt`);
  fs.writeFileSync(promptFile, fullPrompt, "utf8");

  try {
    await runAppleScript(path.join(__dirname, "drive-cowork.applescript"), [promptFile]);
  } finally {
    fs.rmSync(promptFile, { force: true });
  }

  return resultPath;
}

// Watches for either the result file to show up, or the execution to have
// already been finalized some other way (the MCP tool calling report-result
// directly) — whichever happens first. Checking status is cheap and
// best-effort, so it rides the same 5s tick as the file check instead of
// its own timer.
async function waitForResult(executionId, resultPath) {
  const deadline = Date.now() + CONFIG.resultTimeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(resultPath)) {
      // A short settle delay in case Cowork is still mid-write when the
      // file first appears on disk.
      await sleep(1500);
      const text = fs.readFileSync(resultPath, "utf8").trim();
      if (text) return { text, alreadyResolved: false };
    }
    const status = await checkExecutionStatus(executionId);
    if (status && status !== "running") {
      return { text: null, alreadyResolved: true };
    }
    await sleep(5000);
  }
  return { text: null, alreadyResolved: false };
}

async function processJob(job) {
  console.log(`[cowork-agent] Peguei a tarefa da skill "${job.skillName}" (execução ${job.executionId})`);
  await markStarted(job.executionId);
  try {
    const resultPath = await driveCowork(job.executionId, job.prompt);
    console.log(`[cowork-agent] Cowork disparado, aguardando resultado em ${resultPath} (ou via MCP)`);
    const { text, alreadyResolved } = await waitForResult(job.executionId, resultPath);
    if (alreadyResolved) {
      console.log(
        "[cowork-agent] Essa execução já foi finalizada por outro caminho (provavelmente a " +
          "ferramenta MCP report_cowork_result) — nada a reportar aqui."
      );
    } else if (text) {
      console.log(`[cowork-agent] Resultado recebido via arquivo (${text.length} caracteres) — reportando sucesso`);
      try {
        await reportResult(job.executionId, { status: "success", result: text });
      } catch (err) {
        if (isAlreadyFinalizedError(err)) {
          console.log(
            "[cowork-agent] O arquivo apareceu, mas essa execução já tinha sido finalizada via " +
              "MCP antes — reporte pelo arquivo descartado, sem problema."
          );
        } else {
          throw err;
        }
      }
    } else {
      console.log("[cowork-agent] Cowork não respondeu dentro do tempo esperado — reportando erro");
      await reportResult(job.executionId, {
        status: "error",
        error:
          "O Cowork não reportou um resultado (nem via arquivo, nem via MCP) dentro do tempo " +
          "esperado. Verifique manualmente o app no Mac mini — a tarefa pode ainda estar " +
          "rodando, ou o agente não conseguiu dispará-la corretamente (veja mac-agent/README.md).",
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
