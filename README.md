# Skills Hub

Every Claude skill/MCP your boss sends you over Instagram or Twitter, centralized into one
dashboard — with a name, a description, an input form when it needs one, a run button, and
full execution history. No more re-typing the same prompt from a chat you can't find anymore.

## Stack (and why)

- **Next.js (App Router) + TypeScript** — one codebase for both the dashboard UI and the API
  routes that run skills, generate drafts, and record history. Easy to deploy anywhere later.
- **Prisma + SQLite** — zero-config persistent storage (a single file, no server to run). The
  schema is provider-agnostic, so moving to Postgres later is a one-line change in
  `prisma/schema.prisma` plus `DATABASE_URL` — nothing else in the app needs to change.
- **Tailwind CSS** — fast to iterate on visually. The current look is a plain, warm-neutral
  placeholder (see "Visual style" below) — swap it once you've shared the `Pedido-Central-main`
  reference.

Per the project's working agreement, none of this is meant to be final — it's a reasonable
starting point that's cheap to change as the project grows.

## Data model

- **Skill** — `name`, `description`, `status` (`draft` → `active`), `needsInput`, `usesCowork`,
  `promptTemplate` (with `{{field}}` placeholders), `inputSchema` (JSON list of input fields),
  `sourcePost` (the original pasted post, kept for reference), `confirmedOnce`.
- **Execution** — one row per run attempt, always written, even on failure: `status`
  (`success` / `error` / `needs_setup`), `source` (`cowork` / `claude`), masked `inputValues`,
  masked `promptSnapshot`, `result`, `error`, timestamps.

A skill starts as a `draft` and is automatically promoted to `active` the first time it runs
successfully — matching the "test once, then it's active" flow from the project brief.

## The onboarding flow (paste a post → skill)

`/skills/new` implements the flow from the project brief:

1. Paste the post's content (text, a screenshot's transcript, or a link's context).
2. Click "Turn into a skill draft." If `ANTHROPIC_API_KEY` is set, Claude extracts the name,
   description, prompt template, and whether it needs input / depends on Cowork, proposing input
   fields for anything that looks like it needs a value per run. Without a key, a conservative
   heuristic parser does the same job (detecting `{{placeholders}}` and Cowork mentions) and
   **clearly flags the draft as needing manual review** rather than pretending to be AI-verified.
3. You review and edit everything in a live preview before saving — nothing is saved without
   your confirmation.
4. It saves as a `draft`. It's promoted to `active` automatically after its first successful run.

## Running a skill

Every skill's page shows a generated input form (when it needs one), a run button, and full
history. Before a run — always, not just the first time — the exact prompt that will be sent is
shown in a confirmation modal, with any secret-typed field masked in the preview (the real value
is only ever used in memory for that one dispatch call, never written to the database or shown
in full again).

## Claude Cowork integration

The project brief is explicit that Cowork shouldn't be special-cased, and that this integration
point should be checked against whatever the current environment actually offers rather than
assumed once and hardcoded. **As of this build, no Cowork dispatch mechanism (webhook, SDK, or
MCP tool) was discoverable in the environment**, so `lib/cowork.ts` does not simulate a result —
a Cowork-dependent skill records an execution with status `needs_setup` and a clear message
telling you what's missing, both on the skill page and in history.

To wire it up for real: set `COWORK_DISPATCH_WEBHOOK_URL` (and `COWORK_DISPATCH_TOKEN` if
needed) to whatever Cowork exposes when you have it, and the same adapter will dispatch and
record real results — no other code needs to change.

Skills that don't depend on Cowork run directly through the Claude API when `ANTHROPIC_API_KEY`
is set (`lib/claude.ts`); otherwise they're flagged `needs_setup` the same way.

## Security baseline

- Any input field typed `secret` (credentials, tokens) is masked before it's ever written to
  execution history, in both the stored prompt snapshot and the stored input values
  (`lib/mask.ts`). Only the last 4 characters are kept, for recognizability.
- Every run attempt is recorded, success or failure — nothing fails silently.
- No credential, token, or endpoint is ever invented. If a skill needs one that isn't configured,
  it's surfaced as `needs_setup` in the dashboard rather than faked.

## Visual style

This build uses a plain, warm-neutral placeholder look (see `tailwind.config.ts`). The project
brief mentions `Pedido-Central-main` as a style reference but no screenshots or access have been
shared yet — once you share those, the visual design should be restyled to match.

## Running locally

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY / COWORK_* if you have them
npx prisma db push
npx tsx prisma/seed.ts # optional: seeds one example draft skill
npm run dev
```

## Known follow-ups

- `next@14.2.35` is the latest patch on the 14.x line, but a couple of advisories (AVIF image
  optimization RCE, an internal `postcss` bundled by Next) are only fully resolved on Next 16,
  which has breaking changes (e.g. `params` becomes a `Promise` in route handlers). Worth a
  deliberate upgrade pass later — flagging rather than doing a rushed breaking migration now.
- Skill editing (beyond the input-schema editor at creation time) is minimal — there's a `PATCH
  /api/skills/[id]` endpoint but no dedicated edit screen yet.
- No auth — this is built as a single-user internal tool for now, per the project brief.
