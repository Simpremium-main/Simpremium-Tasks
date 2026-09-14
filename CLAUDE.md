# Skills Hub

<project_context>
I get posts almost every day from my boss on Instagram/Twitter with skills/MCPs for Claude —
things like generating a PDF report, researching something about the company, etc. Right now
these just live loose in chat history and get lost.

I want a project that centralizes these skills into a dashboard: a list with name, description,
and result history for each one, plus a way to run them right there without rebuilding the
prompt every time.

Skills that need some input or special config should get a simple way to fill that in (a form, a
field, whatever fits the case) instead of me having to type everything out by hand again.

Several of these skills depend on Claude Cowork to run — the project needs to treat that as a
normal part of the flow, not an exception.

I want freedom for the design, data model, stack, and flows to evolve as the project grows —
don't lock in decisions early. I'd rather you (Claude Code) propose and adjust over time than
have me define everything upfront.
</project_context>

<skill_onboarding_flow>
When I paste the content of a post (text, screenshot, link) and ask to turn it into a skill, the
expected flow is:

1. Understand what the skill does, whether it needs any input from me to run, and whether it
   depends on Cowork or an external MCP.
2. If it needs input, generate the input method yourself (form, fields, whatever makes most
   sense) from what the skill requires — don't ask me field by field, just show me a preview to
   confirm.
3. Save the skill as a draft until I've tested it successfully at least once; only then mark it
   active.
4. Never invent a credential, token, or endpoint I haven't provided — if something's missing,
   surface it as pending in the dashboard instead of simulating a result.
</skill_onboarding_flow>

<cowork_integration>
Skills that depend on Cowork to run should not be treated as a special case — the natural flow
is:

1. Assemble the final instruction (the prompt + the inputs I filled in).
2. Dispatch it to Cowork through whatever integration is available in the environment at
   implementation time — don't hardcode this to one fixed method here, since it changes between
   product versions. Check the current way to do it before assuming.
3. Store whatever comes back as a normal execution in that skill's history, tagging the source
   as Cowork.

If it's not clear how to connect to Cowork in the current environment, don't simulate a result —
flag in the dashboard that the skill needs manual setup before it can run.
</cowork_integration>

<dashboard_requirements>
- List of skills with name, short description, status, and a visual indicator for "needs input" /
  "uses Cowork".
- A per-skill page with the full description, the input method (when it exists), a run button,
  and that skill's execution history (most recent first, with each run's result/error).
- A global history view across all skills, so I can find "that report I ran last week" without
  digging through each skill individually.
- A way to add a new skill by pasting the post content, following the flow above.
</dashboard_requirements>

<security_baseline>
- No skill credential or token should ever appear in plain text in execution history or logs —
  always mask it.
- Before running a skill for the first time, show me a summary of what it's about to do (the
  final command/prompt) so I can confirm.
- Every execution, even a failed one, must be recorded in history — never fail silently without
  leaving a trace.
</security_baseline>

<visual_reference>
I have another internal project, `Pedido-Central-main`, whose look I like and want as a style
reference (not a functional one). If I haven't shared screenshots or access yet, ask before
defaulting to a generic style.
</visual_reference>

<working_agreement>
- Stack, data modeling, and screen-flow decisions: propose, briefly explain the why, and proceed
  — no need to check in on every detail.
- Real questions (things only I can answer, like credentials or business preference) — yes, ask
  those.
- I'd rather evolve incrementally and see things working than get a fixed plan upfront.
</working_agreement>

## Current state

See `README.md` for the stack, data model, and what's built so far. In short: a Next.js
dashboard implementing the onboarding flow, per-skill run + history, global history, and secret
masking. Persistence is planned to be Supabase, but runs on an in-memory mock store for now
(`lib/data.ts` — the single seam to swap later; target schema in `supabase/schema.sql`) since no
Supabase project/keys have been provided yet. Cowork dispatch is a pluggable adapter
(`lib/cowork.ts`) currently flagged `needs_setup` since no Cowork dispatch mechanism was
discoverable in the build environment — wire up `COWORK_DISPATCH_WEBHOOK_URL` once one is
available. Visual style: a `Pedido-Central-main` screenshot was shared and applied (dark
collapsible sidebar listing skills, sticky page headers, pill badges, `lucide-react` icons,
animations) — see README's "Visual style" section.

## Git workflow

Commit and push straight to `main` — no feature branches or PRs needed for this project.
