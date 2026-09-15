# Skills Hub

Every Claude skill/MCP your boss sends you over Instagram or Twitter, centralized into one
dashboard — with a name, a description, an input form when it needs one, a run button, and
full execution history. No more re-typing the same prompt from a chat you can't find anymore.

## Stack (and why)

- **Next.js (App Router) + TypeScript** — one codebase for both the dashboard UI and the API
  routes that run skills, generate drafts, and record history. Easy to deploy anywhere later.
- **Supabase (Postgres)** — `lib/data.ts` is the single seam every page and API route goes
  through for persistence, backed by real Supabase tables (`supabase/schema.sql`). Reads and
  writes go through `lib/supabaseClient.ts`'s server-only client, authenticated with the service
  role key (never sent to the browser) — nothing in `app/` or `components/` talks to Supabase
  directly.
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

### Connecting Supabase

Started on mock in-memory data, moved to a real Supabase project once one existed. To point the
app at your own:

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the project's SQL Editor — creates `skills` and `executions`
   with RLS enabled and no policies (the app only ever talks to them server-side with the
   service role key, which bypasses RLS, so the anon key grants zero direct access).
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API (see `.env.example`).

`listSkills()` seeds one example skill the first time it runs against an empty `skills` table —
its id is fixed (`SEED_SKILL_ID` in `lib/data.ts`) so that one link never breaks across restarts.
Everything you create afterward is real, durable Postgres data.

**Known gap:** this codebase was built in a sandboxed environment whose network policy blocks
the Supabase host, so the Supabase wiring was verified by unit-testing the client against the
real project (confirmed the exact failure is the sandbox's own 403, not a code or schema issue)
but not exercised end-to-end in a browser. Worth a quick smoke test after your first deploy —
create a skill, refresh, confirm it's still there.

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
wanted before Supabase Auth was wired up): **the password is never checked against anything —
any name + any non-empty password gets in.** This is not access control; anyone with the URL can
log in as anyone. It exists so the login screen, session cookie, and "who ran this" attribution
in execution history all have real UI/flow to build against.

Supabase itself is now connected for *data* (skills/executions — see "Connecting Supabase"), but
login is still this placeholder — Supabase Auth is a separate piece of work from the database.
Everything is isolated in `lib/auth.ts` (`getCurrentUser`, session cookie helpers) and
`app/api/auth/login/route.ts` (where the fake check lives, clearly commented). To make it real:
swap that route's check for `supabase.auth.signInWithPassword()` (or similar), and
`getCurrentUser()` for reading Supabase's session — every route/page/component that calls
`getCurrentUser()` keeps working unchanged. Needs real user accounts created in Supabase
(Authentication → Users in the dashboard) — not done yet, since inventing an account/password
isn't something to do without being asked.

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
cp .env.example .env   # fill in the Supabase vars (required) + ANTHROPIC_API_KEY / COWORK_* if you have them
# run supabase/schema.sql in your Supabase project's SQL Editor first — see "Connecting Supabase" above
npm run dev
```

Every page is behind `/login` — enter any name and any password (see "Login — placeholder"
above for why).

## Known follow-ups

- `next@14.2.35` is the latest patch on the 14.x line, but a couple of advisories (AVIF image
  optimization RCE, an internal `postcss` bundled by Next) are only fully resolved on Next 16,
  which has breaking changes (e.g. `params` becomes a `Promise` in route handlers). Worth a
  deliberate upgrade pass later — flagging rather than doing a rushed breaking migration now.
- Skill editing (beyond the input-schema editor at creation time) is minimal — there's a `PATCH
  /api/skills/[id]` endpoint but no dedicated edit screen yet.
- **Real auth.** Login currently accepts any password (see "Login — placeholder" above) — the
  Supabase project is connected now, just needs Auth wired up (real user accounts created in the
  dashboard, then swap the check in `app/api/auth/login/route.ts`).
- **Real file generation.** Downloads today export Claude's real text result as `.txt`/`.pdf`;
  no skill produces an actual binary file end-to-end yet (see "Execution details and downloads"
  above) — would need Claude's code-execution/files tooling or real Cowork artifacts.
