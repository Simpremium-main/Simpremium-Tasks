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
Everything you create afterward is real, durable Postgres data. It's a normal skill like any
other — not hardcoded or protected — so once you've got real skills in place, delete it from its
page like you would any other.

**The sidebar's list not updating after creating/deleting a skill** was a second, separate bug
found after the `cache()` fix above turned out not to be enough: `DeleteSkillButton` and
`NewSkillForm` used to do `router.push(url); router.refresh();` right after their request
succeeded. The sidebar lives in the shared `app/(app)/layout.tsx`, and the App Router does **not**
automatically re-fetch a layout when client-side navigation moves to a sibling page that shares
it — and calling `refresh()` in the same tick right after `push()` can race Next's navigation
scheduling and miss the very route it just pushed to, so the layout (and its sidebar) can be left
showing stale data even though the page you land on is correct. Both components now do a full
`window.location.href = ...` navigation instead — heavier than a client-side transition, but it
guarantees everything (layout included) is freshly fetched, for an action (create/delete a skill)
that's infrequent enough that the tradeoff is a non-issue. `RunSkillPanel`'s plain `router.refresh()`
(no accompanying `push()`, same page) doesn't have this race and was left as-is.

`listSkills()` is intentionally a plain async function, not wrapped in React's `cache()`. An
earlier version wrapped it to dedupe the layout + page both calling it in the same request, but
`cache()`'s per-request reset only really applies to Server Component rendering — it doesn't
reliably reset the same way when the same function is also called from a Route Handler
(`app/api/skills/route.ts`), and on a warm serverless instance that stale memoized result can leak
into unrelated later requests. That's what caused the dashboard to get stuck showing only the seed
skill in production even though real skills existed in the DB. The `upsert`/`ignoreDuplicates` fix
in `ensureSeeded` (below) is what actually prevents the seeding race — the `cache()` wrapper was
never needed for correctness, just a minor round-trip saving that wasn't worth the risk.

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

The confirmation modal also has a "Pensando…" indicator once you hit run — click it to expand a
live, streaming view of the answer as Claude writes it, instead of just staring at a spinner until
the whole thing lands. `POST /api/skills/[id]/run/stream` (`lib/claude.ts`'s
`streamDispatchToClaude`, `lib/runSkill.ts`'s `runSkillStreaming`) streams Server-Sent Events —
`delta` chunks as they arrive, then one `done` event with the saved execution row, same as the
non-streaming path. It's only real token-by-token streaming for skills that run directly through
the Claude API; Cowork dispatch is a single blocking webhook call (see below) with no way to
stream partial output, so a Cowork skill's "Pensando…" panel just shows "Despachando pro Cowork…"
until the one final result comes back. The older `POST /api/skills/[id]/run` (plain JSON, no
streaming) is still there too, for any script that'd rather not parse SSE.

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

## Login — real Supabase Auth

`middleware.ts` gates every page behind `/login`, backed by real Supabase Auth (email +
password) — not a placeholder anymore. Built with `@supabase/ssr` following Supabase's own
Next.js App Router recipe:

- `lib/supabase/server.ts` — a Supabase client bound to the request's cookies (anon key), for
  Server Components and Route Handlers. `lib/auth.ts`'s `getCurrentUser()` uses it and calls
  `supabase.auth.getUser()` (re-validates the token against Supabase, rather than trusting
  `getSession()`'s unverified local read — Supabase's own recommendation for anything
  access-gating).
- `middleware.ts` re-validates the session on every request and redirects to `/login` when
  there isn't one, refreshing the session cookie along the way.
- `app/api/auth/login/route.ts` calls `supabase.auth.signInWithPassword()`; logout calls
  `supabase.auth.signOut()`. Login errors are split by cause: a real rejected-credentials
  response from Supabase shows a generic "email ou senha incorretos" (never reveals whether the
  email exists), while any other failure (network/misconfiguration) shows the actual error name
  — worth knowing the difference if login ever fails after a deploy.

**Accounts are managed entirely in the Supabase dashboard** (Authentication → Users) — there's no
self-serve signup screen in the app. Add whoever needs access there.

The logged-in email is stamped on every execution (`ranBy`) and shown in both the skill page's
and the global history's execution list, detail view, and the sidebar footer.

**Same sandbox network limitation as the database:** this couldn't be exercised end-to-end in a
browser here either (see "Connecting Supabase" above for what was verified instead — the same
approach applies: the code compiles and type-checks, and a standalone script against the real
project reproduced the identical sandbox-network-block signature for `signInWithPassword`, not a
code or credentials problem). Test the actual login after deploying.

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
gives back text, full stop, and Cowork is still `needs_setup`. The `.txt`/`.pdf` download buttons
are an honest export of that real text result into a document you can save — not a fabricated
file, but also not proof Claude generated a PDF itself. Real file generation (via Claude's
code-execution/files tooling, or whatever Cowork returns once connected) is a separate, larger
piece of work than this download convenience.

Early on, a skill whose prompt asked for "a PDF" got back Claude explaining how to write one
yourself (chat-assistant instincts — "I can't create files, but here's some Python...") instead
of just the content that should go in it. Fixed with a system prompt in `lib/claude.ts`
(`SKILL_EXECUTION_SYSTEM_PROMPT`) that tells Claude it's running as a skill's execution engine,
not a live chat: produce the content directly, no meta-commentary about its own limitations —
the platform handles turning that content into a file. Doesn't change the underlying limitation
above (still text, not a binary Claude generated), just makes what comes back actually usable.

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
which on narrow screens becomes an off-canvas drawer (hamburger button top-left, backdrop, closes
on navigation) instead of squeezing the page content — the desktop collapse/expand toggle is
separate from this and only shows at the `lg` breakpoint and up,
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

Every page is behind `/login` — you need a real account (Supabase dashboard → Authentication →
Users) to get in; see "Login — real Supabase Auth" above.

## Known follow-ups

- `next@14.2.35` is the latest patch on the 14.x line, but a couple of advisories (AVIF image
  optimization RCE, an internal `postcss` bundled by Next) are only fully resolved on Next 16,
  which has breaking changes (e.g. `params` becomes a `Promise` in route handlers). Worth a
  deliberate upgrade pass later — flagging rather than doing a rushed breaking migration now.
- Skill editing (beyond the input-schema editor at creation time) is minimal — there's a `PATCH
  /api/skills/[id]` endpoint but no dedicated edit screen yet. Deleting one is possible though
  (`DeleteSkillButton` on the skill page, with a confirm step).
- No self-serve signup — new accounts are added by hand in the Supabase dashboard. Fine for a
  small internal team; worth a signup/invite screen if the group using this grows.
- **Real file generation.** Downloads today export Claude's real text result as `.txt`/`.pdf`;
  no skill produces an actual binary file end-to-end yet (see "Execution details and downloads"
  above) — would need Claude's code-execution/files tooling or real Cowork artifacts.
