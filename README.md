# Skills Hub

Every Claude skill/MCP your boss sends you over Instagram or Twitter, centralized into one
dashboard — with a name, a description, an input form when it needs one, a run button, and
full execution history. No more re-typing the same prompt from a chat you can't find anymore.

## Stack (and why)

- **Next.js (App Router) + TypeScript** — one codebase for both the dashboard UI and the API
  routes that run skills, generate drafts, and record history. Easy to deploy anywhere later.
- **Mock data for now, Supabase next** — `lib/data.ts` is the single seam every page and API
  route goes through for persistence. Today it's backed by an in-memory store (seeded on first
  import, resets when the server restarts). When Supabase is connected, only this file's
  internals change to real Supabase queries — every caller keeps working unchanged.
  `supabase/schema.sql` documents the target Postgres schema this mock store already mirrors
  field-for-field, ready to run in the Supabase SQL editor when there's a project to point at.
  Nothing here invents a Supabase URL or key — none has been provided yet.
- **Tailwind CSS** — fast to iterate on visually. The current look is a plain, warm-neutral
  placeholder (see "Visual style" below) — swap it once you've shared the `Pedido-Central-main`
  reference.

Per the project's working agreement, none of this is meant to be final — it's a reasonable
starting point that's cheap to change as the project grows.

## Data model

- **Skill** — `name`, `description`, `status` (`draft` → `active`), `needsInput`, `usesCowork`,
  `promptTemplate` (with `{{field}}` placeholders), `inputSchema` (a list of input fields),
  `sourcePost` (the original pasted post, kept for reference), `confirmedOnce`, `group`
  (a category, or `null`), `tags` (a list of short strings).
- **Execution** — one row per run attempt, always written, even on failure: `status`
  (`success` / `error` / `needs_setup`), `source` (`cowork` / `claude`), masked `inputValues`,
  masked `promptSnapshot`, `result`, `error`, `ranBy` (the logged-in name that triggered it, or
  `null`), timestamps.

A skill starts as a `draft` and is automatically promoted to `active` the first time it runs
successfully — matching the "test once, then it's active" flow from the project brief.

### Why mock data right now

The brief asked for Supabase but said to use mock data for now, so `lib/data.ts` is plain
in-memory arrays behind async functions shaped exactly like the eventual database calls
(`listSkills`, `getSkill`, `createExecution`, etc.). Two things worth knowing about this stage:

- **Data resets** whenever the dev server restarts, and on a serverless host like Vercel it can
  reset between requests too (each invocation may get a fresh module instance) — there's no
  durable storage yet, by design, until Supabase is wired up. In practice this means any skill
  you create yourself can disappear (and its URL 404) after a redeploy or a cold start — a known,
  accepted limitation of "mock data for now" while Supabase isn't connected.
- **The seed skill's id is fixed** (`SEED_SKILL_ID` in `lib/data.ts`), on purpose — it's the one
  link in the app that's meant to always work, so there's always at least one stable example to
  click through even though the store itself resets. Skills created afterwards still get a random
  id and are only as durable as the mock store.
- **Swapping to Supabase later** means implementing these same functions against
  `@supabase/supabase-js` using the tables in `supabase/schema.sql`, and nothing in `app/` or
  `components/` needs to know the difference.

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

## Login — ⚠️ placeholder, not real security

`middleware.ts` gates every page behind `/login`. As explicitly requested (a real login was
wanted, but Supabase isn't connected yet): **the password is never checked against anything —
any name + any non-empty password gets in.** This is not access control; anyone with the URL can
log in as anyone. It exists so the login screen, session cookie, and "who ran this" attribution
in execution history all have real UI/flow to build against before Supabase Auth is wired up.

Everything is isolated in `lib/auth.ts` (`getCurrentUser`, session cookie helpers) and
`app/api/auth/login/route.ts` (where the fake check lives, clearly commented). To make it real:
swap that route's check for an actual Supabase Auth call, and `getCurrentUser()` for reading
Supabase's session — every route/page/component that calls `getCurrentUser()` keeps working
unchanged. Needs a Supabase project + keys, which haven't been provided.

The logged-in name is stamped on every execution (`ranBy`) and shown in both the skill page's
and the global history's execution list and detail view.

## Groups and tags

Skills can have a `group` (e.g. "Relatórios", "Pesquisa") and free-form `tags`. The sidebar
sections skills by group (mirroring the reference's sectioned nav), and the dashboard has a group
filter alongside the status filter and search. Both are editable in the new-skill preview before
saving; the AI-assisted parser proposes a group/tags guess when `ANTHROPIC_API_KEY` is set (the
heuristic fallback leaves them blank for you to fill in — it doesn't guess).

## Execution details and downloads

Each execution row has a "Ver detalhes" button opening a modal with the full prompt, result,
and error, who ran it, and timestamps — with a copy-to-clipboard button on each block. When an
execution has a text result, you can also download it as `.txt` or `.pdf` (`lib/exportResult.ts`,
using `jspdf` client-side).

**Important caveat on "generates a PDF" skills:** neither the Claude API call in `lib/claude.ts`
nor the Cowork adapter in `lib/cowork.ts` actually returns a binary file today — Claude's API
gives back text, full stop, and Cowork is still `needs_setup`. So a skill whose prompt says
"generate a PDF sales report" gets back *text* describing that report, not an actual file Claude
produced. The `.txt`/`.pdf` download buttons are an honest export of that real text result into a
document you can save — not a fabricated file, but also not proof Claude generated a PDF itself.
Real file generation (via Claude's code execution/files tooling, or whatever Cowork returns once
connected) is a separate, larger piece of work than this download convenience.

## Security baseline

- Any input field typed `secret` (credentials, tokens) is masked before it's ever written to
  execution history, in both the stored prompt snapshot and the stored input values
  (`lib/mask.ts`). Only the last 4 characters are kept, for recognizability.
- Every run attempt is recorded, success or failure — nothing fails silently.
- No credential, token, or endpoint is ever invented. If a skill needs one that isn't configured,
  it's surfaced as `needs_setup` in the dashboard rather than faked.

## Visual style

Restyled to match a screenshot shared of `Pedido-Central-main`: a dark, collapsible sidebar
(persistent nav + a live list of every skill, with a status dot and search once the list grows),
a sticky page header per screen (icon, title, breadcrumb-style subtitle, actions), white
bordered cards on a warm off-white canvas, and pill-shaped status badges (`lucide-react` icons
throughout, small hover/transition/fade-in animations, a scale-in + backdrop-blur run
confirmation modal). Colors and tokens live in `tailwind.config.ts` (`primary` = the blue accent,
`sidebar.*` = the dark nav palette, `cowork` = the accent used for Cowork-specific badges) if it
needs tweaking against a closer look at the reference later.

A follow-up pass added search/status filters on the dashboard and history pages
(`components/SkillsBoard.tsx`, `components/HistoryBoard.tsx`) and a brief highlight animation on
the execution row a run just added. An earlier version of that pass also added KPI stat-tile rows
(total skills, success rate, etc.) — removed after feedback that they weren't wanted; the search/
filter bars stayed.

## Running locally

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY / COWORK_* if you have them
npm run dev            # mock data seeds itself on first request, nothing else to set up
```

Every page is behind `/login` — enter any name and any password (see "Login — placeholder"
above for why).

## Known follow-ups

- **Connect Supabase.** `lib/data.ts` is ready to be re-implemented against
  `@supabase/supabase-js` using `supabase/schema.sql` — needs a Supabase project + keys, which
  haven't been provided.
- `next@14.2.35` is the latest patch on the 14.x line, but a couple of advisories (AVIF image
  optimization RCE, an internal `postcss` bundled by Next) are only fully resolved on Next 16,
  which has breaking changes (e.g. `params` becomes a `Promise` in route handlers). Worth a
  deliberate upgrade pass later — flagging rather than doing a rushed breaking migration now.
- Skill editing (beyond the input-schema editor at creation time) is minimal — there's a `PATCH
  /api/skills/[id]` endpoint but no dedicated edit screen yet.
- **Real auth.** Login currently accepts any password (see "Login — placeholder" above) —
  needs a Supabase project + keys to become real Supabase Auth.
- **Real file generation.** Downloads today export Claude's real text result as `.txt`/`.pdf`;
  no skill produces an actual binary file end-to-end yet (see "Execution details and downloads"
  above) — would need Claude's code-execution/files tooling or real Cowork artifacts.
