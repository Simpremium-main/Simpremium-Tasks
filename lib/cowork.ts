/**
 * Cowork dispatch, and why it's asynchronous.
 *
 * There is no official Anthropic API/webhook to trigger a Cowork task —
 * checked directly against the current docs and an open GitHub issue
 * (anthropics/claude-code#94918, "Add API/webhook trigger for Claude
 * Cowork tasks", filed Critical priority, still open, no maintainer
 * response) rather than assumed. Claude Code Routines *do* have a real,
 * documented API trigger (POST /v1/claude_code/routines/{id}/fire), but
 * routines "execute on Anthropic-managed cloud infrastructure" per
 * code.claude.com/docs/en/routines — they run in Anthropic's cloud, not on
 * the user's own machine, so they don't fit "run this on my Mac mini and
 * have it actually use Cowork locally."
 *
 * So dispatch here is a queue, not a call: a Cowork skill's execution row
 * is written as "running" by lib/runSkill.ts's startExecution like any
 * other run, and lib/runSkill.ts's Cowork branch stores the real
 * (unmasked) prompt on that row via setCoworkPayload — that row IS the
 * queued job. A small agent script running on the user's own machine (see
 * mac-agent/ at the repo root) polls GET /api/cowork-agent/next-job,
 * drives the Cowork desktop app itself (AppleScript/GUI automation — see
 * mac-agent/README.md for exactly how, and its real caveats), and reports
 * back through POST /api/cowork-agent/report-result, which finalizes the
 * execution row through the same finishExecution every other dispatch
 * path uses. Nothing here fakes a result if that agent never checks in —
 * a queued job just stays "running" (and ExecutionList's existing "this
 * has been running a while" badge picks it up), the same honest state as
 * any other stalled run.
 */
export function isCoworkAgentConfigured(): boolean {
  return Boolean(process.env.COWORK_AGENT_TOKEN);
}
