# Cowork agent (runs on your Mac mini)

Why this exists: there is no official Anthropic API or webhook to trigger a Claude Cowork task
(confirmed against the current docs and an open GitHub feature request,
[anthropics/claude-code#94918](https://github.com/anthropics/claude-code/issues/94918) — Cowork tasks
only support fixed-cadence scheduling today). Claude Code Routines do have a real API trigger, but
routines run on Anthropic's cloud infrastructure, not on your own machine — no good if the point is
using Cowork's access to your actual Mac. See the main repo's README, "Cowork on your own machine"
section, for the full reasoning.

So this is a small always-on script that runs *on the Mac mini itself* (not on Vercel): it polls the
dashboard for queued Cowork jobs, drives the Claude Desktop app locally through AppleScript, and
reports the result back. No inbound networking needed on this machine — it only ever calls *out* to
the dashboard, so nothing needs port-forwarding, a tunnel, or a public IP.

**Two things both need to work for a job to actually complete**: `drive-cowork.applescript`
(confirmed working — tested against a real Mac mini) actually driving Cowork, and the
`report_cowork_result` MCP tool (`mac-agent/mcp-report-result/`, see "Reportando resultado via MCP"
below) actually being reachable from a Cowork task, so it can report back. There's no local-file
fallback anymore — if the MCP tool can't be reached, a job has no way to report its result at all,
so get both working before relying on this for anything real.

## How it works

1. `agent.js` polls `GET {DASHBOARD_URL}/api/cowork-agent/next-job` every 15s (configurable).
2. When a job comes back, it immediately `POST`s to `{DASHBOARD_URL}/api/cowork-agent/mark-started`
   (best-effort — a failure here never blocks the job itself) so the dashboard can show "Cowork
   trabalhando há Xm" instead of a generic "running" that could just as easily mean "still in the
   queue, nobody's touched it yet".
3. It writes the skill's prompt to a temp file, appends an instruction telling Cowork to call the
   `report_cowork_result` MCP tool with this exact execution id when it's done, and runs
   `drive-cowork.applescript` to paste that prompt into Cowork and submit it.
4. It then polls `GET {DASHBOARD_URL}/api/cowork-agent/execution-status` (up to 20 minutes by
   default) waiting for that MCP call to have landed and moved the execution off "running" — the
   MCP tool itself is what actually calls `POST {DASHBOARD_URL}/api/cowork-agent/report-result`
   with the real result, not this agent.
5. If the timeout hits with no report, `agent.js` reports the execution as failed itself, with a
   message pointing at the MCP setup.
6. Back to step 1 — always after the full `POLL_INTERVAL_MS` wait, even right after finishing a
   job. (It used to skip that wait to check for more work sooner, but that turned "the server keeps
   handing back a job it can't actually process" into an unthrottled retry loop, confirmed from a
   real run's logs. Worth knowing if you ever see a burst of near-identical log lines.)

Every step is logged to stdout (`[cowork-agent] ...`) — now including every poll attempt and every
job received, not just successful pickups, so a "nothing's happening" silence versus "it's polling
but finding nothing" is visible without extra digging. The dashboard itself also shows a live
"Agente ativo — visto há Xs" pill and a queue badge ("N aguardando · M em andamento") next to the
skills list's other buttons — a quick way to confirm the agent is reaching the dashboard, and
whether there's a backlog, without needing this Terminal or Supabase's SQL editor at all. If a job
ever needs to be abandoned (stuck, wrong data, whatever), there's now a "Cancelar" button directly
on the execution in the dashboard — no more reaching into the database by hand to delete a row.

## Requirements

- macOS (uses `osascript`/AppleScript — this won't run on Linux or Windows).
- [Node.js](https://nodejs.org) 18 or later (uses the built-in `fetch`, no dependencies to install).
- Claude Desktop installed and signed in, with Cowork available on your plan.
- Accessibility permission granted for GUI automation (see below).

## Setup

1. **Generate a shared secret.** Anything long and random works:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Set it in the dashboard.** Add `COWORK_AGENT_TOKEN=<that value>` to your Vercel project's
   environment variables (Project Settings → Environment Variables) and redeploy.
3. **Configure this agent.** In this folder:
   ```
   cp .env.example .env
   ```
   Fill in `DASHBOARD_URL` (your deployed dashboard's URL, no trailing slash) and
   `COWORK_AGENT_TOKEN` (the exact same value from step 1).
4. **Grant Accessibility permission** — required for AppleScript to control another app's UI:
   System Settings → Privacy & Security → Accessibility → add Terminal (if you'll run this from a
   Terminal tab) or `osascript` itself. Without this, every job fails at the "drive Cowork" step
   with a permission-denied error, and macOS should prompt you the first time it's needed.
5. **Run it:**
   ```
   node agent.js
   ```
   Leave that Terminal tab open, or set up the included launchd template
   (`com.simpremium.coworkagent.plist.example`) to keep it running in the background and restart it
   automatically — see the comments in that file for the two placeholders to fill in.

## Testar o AppleScript

`drive-cowork.applescript` — the piece that actually drives Claude Desktop's Cowork UI — is
**confirmed working**, tested against a real Mac mini: **"Claude"** as the app's process name,
**⌘N** for a new Cowork task, **⌘V** to paste into the (auto-focused) prompt field, and a plain
**Return** to submit all check out. It's still worth re-running this test on a fresh machine, or if
a Claude Desktop update ever changes the UI and jobs start failing at the "drive Cowork" step —
every assumption is still marked with `TODO/verify` comments in the script itself for exactly that
case.

**Test it by itself**, before trusting `agent.js` to run it unattended:

```
echo "diga oi e me diga que horas são" > /tmp/test-prompt.txt
osascript drive-cowork.applescript /tmp/test-prompt.txt
```

Watch what actually happens on screen. If a step doesn't do what the comment above it assumes,
that's expected — open `drive-cowork.applescript` in a text editor and adjust that step (the exact
keystroke, the delay, or the whole approach) to match what Cowork's UI actually needs. AppleScript's
`System Events` can also target UI elements more precisely than blind keystrokes (e.g.
`click button "New task" of window 1`) if the keystroke approach doesn't pan out — Apple's own
[UI scripting guide](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptX/Concepts/uiscripting.html)
covers that; you can also open **Automator**'s "Record" feature or use the Accessibility Inspector
(part of Xcode's developer tools) to see the actual element names available.

## How results get back — via MCP, no local file

There's no API to read Cowork's conversation, so the prompt sent to Cowork carries an appended
instruction telling it to call the `report_cowork_result` MCP tool with this exact execution id
when it's done — that tool finalizes the execution directly, the same as this agent's own old
`report-result` call used to after reading a local results file. There's **no file-drop fallback**:
if a Cowork task can't reach the tool, the job has no way to report its result at all, and
`agent.js` will eventually report it as failed once `RESULT_TIMEOUT_MS` elapses with the execution
still "running".

`driveCowork()`'s prompt instruction just says "call a tool named report_cowork_result" — it
doesn't know or care which of the two servers below actually answers that call. Pick one.

**If the task generates a real file** (spreadsheet, PDF, ...), the prompt also tells Cowork to
attach that file's content, base64-encoded, in the same tool call's `files` field — saying "sent
the file to you" in its own chat isn't enough, the dashboard only ever sees what's actually in the
tool call. Both servers below forward that into the same Supabase Storage bucket direct-Claude
runs already use, so it shows up in the execution's history like any other generated file.

### Option A: remote connector (recommended)

`app/api/mcp/route.ts`, already deployed as part of the dashboard on Vercel — no local process on
the Mac mini for this piece at all, which sidesteps the whole class of "PATH/config/local Node"
problems the local option (Option B) tends to run into.

1. In Claude Desktop: **Settings → Connectors → Add custom connector**.
2. **URL**: `https://simpremium-tasks.vercel.app/api/mcp`
3. Under request headers / authentication, add a header:
   - Name: `Authorization`
   - Value: `Bearer <same value as mac-agent/.env's COWORK_AGENT_TOKEN>`
4. Save. No restart needed — connectors apply as soon as they're saved.

### Option B: local stdio server (alternative)

`mac-agent/mcp-report-result/` — runs as its own local Node process, configured through Claude
Desktop's config file directly.

1. Install its dependencies:
   ```
   cd mac-agent/mcp-report-result
   npm install
   ```
2. Add it to Claude Desktop's MCP config — `~/Library/Application Support/Claude/claude_desktop_config.json`
   (Claude Desktop → Settings → Developer → Edit Config opens/creates this same file for you). Merge
   this into the `mcpServers` object, filling in the two env values (same
   `DASHBOARD_URL`/`COWORK_AGENT_TOKEN` as this agent's own `.env`, and the **absolute** path to
   `index.mjs` — `pwd` inside `mac-agent/mcp-report-result` to get it):
   ```json
   {
     "mcpServers": {
       "skills-hub-report-result": {
         "command": "node",
         "args": ["/absolute/path/to/mac-agent/mcp-report-result/index.mjs"],
         "env": {
           "DASHBOARD_URL": "https://simpremium-tasks.vercel.app",
           "COWORK_AGENT_TOKEN": "same value as mac-agent/.env's COWORK_AGENT_TOKEN"
         }
       }
     }
   }
   ```
3. **Fully quit (⌘Q) and reopen Claude Desktop** (MCP servers are only picked up on startup).
4. If the tool still isn't picked up: GUI apps on macOS often don't inherit the Terminal's `PATH`,
   so a bare `"command": "node"` can fail to resolve even though `node agent.js` works fine in a
   Terminal tab. Run `which node` in Terminal and use that **full path** as `"command"` instead.

If a job's report never lands within the timeout, the agent reports the execution as **failed**
with a message pointing back to this section — it never fakes a result, matching the main
dashboard's own rule that a missing/unconfirmed outcome gets recorded honestly instead of guessed
at.

**Test in two phases — don't skip straight to a real Cowork task**, whichever option you set up:

1. **Plain chat first.** Open a normal (non-Cowork) conversation in Claude Desktop and ask something
   like: *"Chame a ferramenta report_cowork_result com executionId 'teste-123', status 'success' e
   result 'teste manual'."* If the tool is wired up at all, Claude should call it and you'll see a
   confirmation; check the dashboard's Vercel logs for a `report_cowork_result chamado —
   executionId=teste-123` (Option A) or `report-result: recebido do agente — executionId=teste-123`
   (Option B) line (it'll fail since `teste-123` isn't a real execution — that's fine, it proves the
   call reached the server). If Claude says it has no such tool, recheck the connector/config setup
   above.
2. **Only once that works**, run any real Cowork skill through the normal dashboard flow (not a
   manual test prompt). Watch this agent's log: `Execução finalizada via MCP.` means it worked;
   `Cowork não chamou report_cowork_result dentro do tempo esperado` means it didn't reach the tool
   (or didn't call it) — recheck the setup and the phase-1 test above.

## Troubleshooting

- **A dashboard run just sits at "running" forever.** Check this agent's own terminal/log output —
  is it actually running? Is `DASHBOARD_URL`/`COWORK_AGENT_TOKEN` correct (a 401 in the log means
  they don't match what's set in Vercel)? If it logs `Cowork disparado, aguardando o report via
  MCP...` and then never resolves, the MCP tool isn't reaching Cowork — see "How results get back"
  above. If the agent never even logged picking up the job, see "Testar o AppleScript".
- **"HTTP 401" in the log, or Claude Desktop says it can't reach/authenticate the connector
  (Option A).** `COWORK_AGENT_TOKEN` here doesn't match the one in Vercel's environment variables,
  or `COWORK_AGENT_TOKEN` isn't set in Vercel at all — but if it's Option A specifically, check the
  connector's header **Value** field first: Claude Desktop's "Custom Header" mode does **not**
  prepend `Bearer ` for you, so the value must literally start with `Bearer ` followed by the
  token (`Bearer <token>`, not just `<token>`). Pasting only the raw token is the single most
  common cause of a 401 here — confirmed against a real setup.
- **AppleScript errors mentioning permission/not authorized.** Accessibility permission isn't
  granted yet — see step 4 above.
- **The agent process itself crashes or stops.** Each job is wrapped so a failure always reports
  back to the dashboard (never leaves a row stuck at "running" silently) — but if the whole Node
  process dies, nothing is polling anymore. The launchd template restarts it automatically; a plain
  `node agent.js` in a Terminal tab does not.
