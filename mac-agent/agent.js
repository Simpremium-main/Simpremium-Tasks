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
  const get = (key, fallback) => fileVars[key] ?? process.env[key] ?? fallback;

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
 * This is the one part of this agent that's genuinely unverified — see
 * README.md's "The part that needs your testing" section before trusting
 * it blindly. Appends an explicit instruction telling Cowork to save its
 * answer to a known local file, since there's no API to read the result
 * back from the app — the agent then just watches for that file (see
 * waitForResult below) instead of trying to read Cowork's UI.
 */
async function driveCowork(executionId, prompt) {
  const resultPath = path.join(CONFIG.resultsDir, `${executionId}.txt`);
  fs.mkdirSync(CONFIG.resultsDir, { recursive: true });
  // Clean up any stale file from an earlier, unrelated attempt with the
  // same id (shouldn't normally happen — ids are unique — but avoids ever
  // reading a leftover file and reporting a false success).
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

  const fullPrompt =
    `${prompt}\n\n---\nQuando terminar essa tarefa, salve sua resposta final completa (só o ` +
    `conteúdo da resposta, sem comentário adicional) no arquivo "${resultPath}".`;

  const promptFile = path.join(os.tmpdir(), `cowork-prompt-${executionId}.txt`);
  fs.writeFileSync(promptFile, fullPrompt, "utf8");

  try {
    await runAppleScript(path.join(__dirname, "drive-cowork.applescript"), [promptFile]);
  } finally {
    fs.rmSync(promptFile, { force: true });
  }

  return resultPath;
}

async function waitForResult(resultPath) {
  const deadline = Date.now() + CONFIG.resultTimeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(resultPath)) {
      // A short settle delay in case Cowork is still mid-write when the
      // file first appears on disk.
      await sleep(1500);
      const text = fs.readFileSync(resultPath, "utf8").trim();
      if (text) return text;
    }
    await sleep(5000);
  }
  return null;
}

async function processJob(job) {
  console.log(`[cowork-agent] Peguei a tarefa da skill "${job.skillName}" (execução ${job.executionId})`);
  try {
    const resultPath = await driveCowork(job.executionId, job.prompt);
    console.log(`[cowork-agent] Cowork disparado, aguardando resultado em ${resultPath}`);
    const result = await waitForResult(resultPath);
    if (result) {
      console.log(`[cowork-agent] Resultado recebido (${result.length} caracteres) — reportando sucesso`);
      await reportResult(job.executionId, { status: "success", result });
    } else {
      console.log("[cowork-agent] Cowork não respondeu dentro do tempo esperado — reportando erro");
      await reportResult(job.executionId, {
        status: "error",
        error:
          "O Cowork não salvou um resultado dentro do tempo esperado. Verifique manualmente o " +
          "app no Mac mini — a tarefa pode ainda estar rodando, ou o agente não conseguiu " +
          "disparar o Cowork corretamente (veja mac-agent/README.md, 'A parte que precisa do " +
          "seu teste').",
      });
    }
  } catch (err) {
    console.error("[cowork-agent] Falha ao processar a tarefa:", err);
    // Always report back — the execution row is already "running" and
    // waiting; a silent crash here would leave it stuck forever instead
    // of a normal recorded error, breaking the "every attempt gets
    // recorded, even failures" rule the whole dashboard follows.
    try {
      await reportResult(job.executionId, {
        status: "error",
        error: err instanceof Error ? err.message : "Falha desconhecida no agente do Mac mini",
      });
    } catch (reportErr) {
      console.error(
        "[cowork-agent] Além de falhar, não consegui nem reportar o erro pro dashboard:",
        reportErr
      );
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

main();
