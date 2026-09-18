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
  schedule_last_run_at timestamptz,
  pinned          boolean not null default false, -- personal dashboard preference, not part of the skill's definition (not carried by export/import)
  share_token     text unique, -- null means not shared; set means /share/<token> shows a read-only public view of this skill
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

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
  conversation_state jsonb, -- ConversationState | null — saved mid-flight state for a run split across multiple requests
  usage           jsonb, -- TokenUsage | null — {inputTokens, outputTokens}, null for Cowork/heuristic dispatch (no Claude API call to report on)
  ran_by          text, -- display name of the logged-in user who triggered this run
  favorite        boolean not null default false, -- starred by hand, "this was the good run" among several attempts
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

alter table skills enable row level security;
alter table executions enable row level security;
alter table skill_prompt_versions enable row level security;
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
