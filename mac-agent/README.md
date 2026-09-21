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

**Read "The part that needs your testing" below before you rely on this for anything.** The
polling/reporting half is solid — it's plain HTTP calls and file I/O. The half that actually drives
Cowork's UI was written without any way to see Cowork running on a real Mac, so it's a documented
best guess, not a working integration yet.

## How it works

1. `agent.js` polls `GET {DASHBOARD_URL}/api/cowork-agent/next-job` every 15s (configurable).
2. When a job comes back, it immediately `POST`s to `{DASHBOARD_URL}/api/cowork-agent/mark-started`
   (best-effort — a failure here never blocks the job itself) so the dashboard can show "Cowork
   trabalhando há Xm" instead of a generic "running" that could just as easily mean "still in the
   queue, nobody's touched it yet".
3. It writes the skill's prompt to a temp file, appends an instruction telling Cowork to save its
   final answer to `~/CoworkAgent/results/<execution-id>.txt`, and runs `drive-cowork.applescript`
   to paste that prompt into Cowork and submit it.
4. It then watches that results folder for the file to show up (up to 20 minutes by default).
5. Once it appears (or the timeout hits), it `POST`s the outcome to
   `{DASHBOARD_URL}/api/cowork-agent/report-result` — success with the real text, or a clear error.
6. Back to step 1 — always after the full `POLL_INTERVAL_MS` wait, even right after finishing a
   job. (It used to skip that wait to check for more work sooner, but that turned "the server keeps
   handing back a job it can't actually process" into an unthrottled retry loop, confirmed from a
   real run's logs — a `mkdir ''` crash calling `report-result` on an already-cancelled execution,
   dozens of times a second. Worth knowing if you ever see a burst of near-identical log lines.)

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

## The part that needs your testing

`drive-cowork.applescript` is the one piece of this agent that's genuinely unverified — it was
written without any way to see Claude Desktop's Cowork UI running on a real Mac, so every step in
it is a documented best guess (look for the `TODO/verify` comments), not a confirmed fact:

- Whether **"Claude"** is the app's actual process name on your Mac.
- Whether **⌘N** starts a new Cowork task (vs. a different shortcut, a menu item, or a button you
  need to click).
- Whether the prompt input field ends up focused automatically after that, so **⌘V** (paste) lands
  in the right place.
- Whether a plain **Return** submits the message (vs. ⌘+Return, Shift+Return, or a Send button).

**Test it by itself first**, before trusting `agent.js` to run it unattended:

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

## How results get back

Since there's no API to read Cowork's conversation, the prompt sent to Cowork carries an appended
instruction asking it to save its final answer to a specific local file
(`~/CoworkAgent/results/<execution-id>.txt`). This only works if:

- Cowork actually has permission to read/write files on your Mac (it should, as part of its normal
  local file access — grant it when the app asks the first time).
- The instruction survives however you end up pasting the prompt in (it's part of the same text,
  so it should, but double-check if you customize the AppleScript).

If a job's result file never shows up within the timeout, the agent reports the execution as
**failed** with a message pointing back to this section — it never fakes a result, matching the
main dashboard's own rule that a missing/unconfirmed outcome gets recorded honestly instead of
guessed at.

## Reporting results via MCP instead of a local file (experimental, untested)

The file-watching approach above works, but it's indirect: it depends on Cowork actually writing
the file, `agent.js` polling for it every 5s, and a 20-minute timeout before giving up if it never
shows. `mac-agent/mcp-report-result/` is a small alternative worth testing: a minimal
[MCP](https://modelcontextprotocol.io) server exposing one tool, `report_cowork_result`, that POSTs
straight to the dashboard's `POST /api/cowork-agent/report-result` — the same route `agent.js`
itself calls after reading the results file. If a Cowork task can actually call it, the result lands
the instant the task finishes, with no polling delay and no results-folder convention needed.

**What's genuinely unverified here**: whether a Cowork task inherits the MCP servers configured in
Claude Desktop's regular chat settings at all, or runs in a separate context that doesn't see them.
There's no documentation confirming this either way — it needs a real test, which is why this is
kept as a separate, opt-in tool rather than wired into `agent.js`'s main flow yet.

**Setup:**

1. Install its dependencies:
   ```
   cd mac-agent/mcp-report-result
   npm install
   ```
2. Add it to Claude Desktop's MCP config — `~/Library/Application Support/Claude/claude_desktop_config.json`
   (create the file if it doesn't exist yet). Merge this into the `mcpServers` object, filling in
   the two env values (same `DASHBOARD_URL`/`COWORK_AGENT_TOKEN` as this agent's own `.env`, and the
   **absolute** path to `index.mjs` — `pwd` inside `mac-agent/mcp-report-result` to get it):
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
3. **Fully quit and reopen Claude Desktop** (MCP servers are only picked up on startup).

**Test in two phases — don't skip straight to a real Cowork task:**

1. **Plain chat first.** Open a normal (non-Cowork) conversation in Claude Desktop and ask something
   like: *"Chame a ferramenta report_cowork_result com executionId 'teste-123', status 'success' e
   result 'teste manual'."* If the tool is wired up at all, Claude should call it and you'll see a
   confirmation; check the dashboard's Vercel logs for a `report-result: recebido do agente —
   executionId=teste-123` line (it'll fail with 404 since `teste-123` isn't a real execution — that's
   fine, it proves the call reached the server). If Claude says it has no such tool, the MCP server
   isn't loaded — recheck the config path and restart Desktop again.
2. **Only once that works**, test whether a Cowork task specifically can reach it — start any real
   Cowork task and explicitly ask it, as part of the prompt, to call `report_cowork_result` at the
   end with a real (or fake, for this first try) execution ID instead of saving to a file. Watch
   whether it actually happens.

If phase 2 works, the next step (not done yet, on purpose) would be changing `agent.js`'s
`driveCowork()` to append a "call this tool with this executionId" instruction instead of the
"save to this file" one, and possibly skip `waitForResult`'s polling entirely — but that's worth
doing only after confirming Cowork can really reach this tool, not before.

## Troubleshooting

- **A dashboard run just sits at "running" forever.** Check this agent's own terminal/log output —
  is it actually running? Is `DASHBOARD_URL`/`COWORK_AGENT_TOKEN` correct (a 401 in the log means
  they don't match what's set in Vercel)? If the agent picked the job up but Cowork never actually
  got the prompt, see "The part that needs your testing" above.
- **"HTTP 401" in the log.** `COWORK_AGENT_TOKEN` here doesn't match the one in Vercel's environment
  variables, or `COWORK_AGENT_TOKEN` isn't set in Vercel at all.
- **AppleScript errors mentioning permission/not authorized.** Accessibility permission isn't
  granted yet — see step 4 above.
- **The agent process itself crashes or stops.** Each job is wrapped so a failure always reports
  back to the dashboard (never leaves a row stuck at "running" silently) — but if the whole Node
  process dies, nothing is polling anymore. The launchd template restarts it automatically; a plain
  `node agent.js` in a Terminal tab does not.
