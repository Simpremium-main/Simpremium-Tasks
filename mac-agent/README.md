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
2. When a job comes back, it writes the skill's prompt to a temp file, appends an instruction
   telling Cowork to save its final answer to `~/CoworkAgent/results/<execution-id>.txt`, and runs
   `drive-cowork.applescript` to paste that prompt into Cowork and submit it.
3. It then watches that results folder for the file to show up (up to 20 minutes by default).
4. Once it appears (or the timeout hits), it `POST`s the outcome to
   `{DASHBOARD_URL}/api/cowork-agent/report-result` — success with the real text, or a clear error.
5. Back to step 1.

Every step is logged to stdout (`[cowork-agent] ...`) so you can watch what it's doing. The
dashboard itself also shows a live "Agente ativo — visto há Xs" pill (next to the skills list's
other buttons) once this agent has polled at least once — a quick way to confirm it's actually
reaching the dashboard without needing to check this Terminal output.

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
