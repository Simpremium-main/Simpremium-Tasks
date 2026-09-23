-- Skills Hub — Supabase schema.
--
-- Run this once in your Supabase project's SQL Editor (Project → SQL
-- Editor → New query → paste → Run). It creates the two tables the app
-- needs; lib/data.ts will be pointed at these once NEXT_PUBLIC_SUPABASE_URL
-- and SUPABASE_SERVICE_ROLE_KEY are set (see README "Connecting Supabase").
--
-- RLS is enabled with no policies on purpose: the app talks to these tables
-- only from the server using the service role key, which bypasses RLS. That
-- means the anon key (safe to expose to a browser) grants zero access to
-- this data by default — nobody can read/write skills or executions
-- directly from the client, only through our own API routes.

create extension if not exists pgcrypto;

create table if not exists skills (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null default '',
  status          text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  needs_input     boolean not null default false,
  uses_cowork     boolean not null default false,
  prompt_template text not null,
  input_schema    jsonb, -- InputField[] | null, see lib/types.ts
  source_post     text,
  confirmed_once  boolean not null default false,
  "group"         text,
  tags            text[] not null default '{}',
  schedule        jsonb, -- SkillSchedule | null, see lib/types.ts — null means not scheduled
  schedule_input_values jsonb, -- Record<string, string> | null — saved defaults for a scheduled run's form, never includes secret-typed fields
  schedule_api_sources jsonb, -- Record<string, ApiFieldSource> | null — per-field alternative to schedule_input_values: fetch fresh from an external API right before each scheduled run, see lib/types.ts
  schedule_last_run_at timestamptz,
  pinned          boolean not null default false, -- personal dashboard preference, not part of the skill's definition (not carried by export/import)
  share_token     text unique, -- null means not shared; set means /share/<token> shows a read-only public view of this skill
  position        double precision not null default 0, -- drag-and-drop order on the dashboard, ascending — see lib/data.ts's createSkill/updateSkill. Personal ordering, like pinned: not part of the skill's definition, not carried by export/import
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists skills_position_idx on skills (position);

create table if not exists executions (
  id              uuid primary key default gen_random_uuid(),
  skill_id        uuid not null references skills(id) on delete cascade,
  status          text not null check (status in ('pending', 'running', 'success', 'error', 'needs_setup')),
  source          text not null check (source in ('cowork', 'claude', 'manual', 'scheduled')),
  input_values    jsonb, -- Record<string, string> | null — secret fields already masked before insert
  prompt_snapshot text not null, -- secret values already masked before insert
  result          text,
  error           text,
  files           jsonb, -- ExecutionFile[] | null, see lib/types.ts — real generated files in Supabase Storage
  steps           jsonb, -- string[] | null — a Cowork run's own step-by-step account of what it did (e.g. browser navigation), see lib/types.ts
  conversation_state jsonb, -- ConversationState | null — saved mid-flight state for a run split across multiple requests
  usage           jsonb, -- TokenUsage | null — {inputTokens, outputTokens}, null for Cowork/heuristic dispatch (no Claude API call to report on)
  ran_by          text, -- display name of the logged-in user who triggered this run
  favorite        boolean not null default false, -- starred by hand, "this was the good run" among several attempts
  cowork_payload  text, -- the real, unmasked prompt for a queued Cowork job, set only between dispatch and pickup — see lib/cowork.ts. Never read through mapExecutionRow/the Execution type, so it never reaches the UI.
  cowork_started_at timestamptz, -- stamped by POST /api/cowork-agent/mark-started the moment the Mac mini agent actually starts driving Cowork for this job (not when it was queued) — lets the UI say "Cowork's been working on this for Xm" instead of a generic "running" for a job that might still just be waiting in the queue.
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists executions_skill_id_idx on executions (skill_id);
create index if not exists executions_started_at_idx on executions (started_at desc);

-- One row per edit to a skill's prompt template — snapshots the OLD text
-- right before an edit overwrites it (see lib/data.ts's updateSkill and
-- app/api/skills/[id]/route.ts), so a change that turns out worse can be
-- undone. The skill's own prompt_template column always holds the current
-- version; this table is purely history, never read on the normal run path.
create table if not exists skill_prompt_versions (
  id              uuid primary key default gen_random_uuid(),
  skill_id        uuid not null references skills(id) on delete cascade,
  prompt_template text not null,
  changed_by      text, -- display name of the logged-in user who made the edit that superseded this version
  created_at      timestamptz not null default now()
);

create index if not exists skill_prompt_versions_skill_id_idx on skill_prompt_versions (skill_id);

-- Single-row heartbeat: GET /api/cowork-agent/next-job stamps last_seen_at
-- on every poll from the Mac mini agent (see lib/cowork.ts), regardless of
-- whether a job was actually found — the poll itself is the signal the
-- agent is alive. The dashboard reads it to show "agente visto há Xs" /
-- "nunca conectou" instead of that only being visible in the agent's own
-- terminal output. The `id = 1` check keeps this to exactly one row.
create table if not exists cowork_agent_status (
  id             integer primary key default 1,
  last_seen_at   timestamptz,
  -- Manual kill switch: when true, claimNextCoworkJob hands back null no
  -- matter what's queued — lets you stop new jobs from being dispatched to
  -- the agent (e.g. while investigating something odd) without having to
  -- kill the process on the Mac mini itself. Toggled from the dashboard's
  -- Cowork queue badge.
  queue_paused   boolean not null default false,
  constraint cowork_agent_status_singleton check (id = 1)
);

alter table skills enable row level security;
alter table executions enable row level security;
alter table skill_prompt_versions enable row level security;
alter table cowork_agent_status enable row level security;
-- No policies added — see the note at the top of this file for why.

-- Secrets are masked in lib/mask.ts before a row is ever written here — this
-- schema never stores an unmasked credential/token, matching the security
-- baseline in CLAUDE.md.

-- Storage bucket for real generated files (PDF, CSV, XLSX, ...) that a skill
-- run produces via Claude's code execution tool — downloaded from Anthropic's
-- Files API once, then kept here so this app owns its own execution history
-- independent of Anthropic's file retention. Private: the app only ever reads
-- it server-side with the service role key (same bypass-RLS pattern as the
-- tables above), and serves downloads through its own authenticated route
-- rather than a public bucket URL.
insert into storage.buckets (id, name, public)
values ('execution-files', 'execution-files', false)
on conflict (id) do nothing;
