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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists executions (
  id              uuid primary key default gen_random_uuid(),
  skill_id        uuid not null references skills(id) on delete cascade,
  status          text not null check (status in ('pending', 'running', 'success', 'error', 'needs_setup')),
  source          text not null check (source in ('cowork', 'claude', 'manual')),
  input_values    jsonb, -- Record<string, string> | null — secret fields already masked before insert
  prompt_snapshot text not null, -- secret values already masked before insert
  result          text,
  error           text,
  files           jsonb, -- ExecutionFile[] | null, see lib/types.ts — real generated files in Supabase Storage
  conversation_state jsonb, -- ConversationState | null — saved mid-flight state for a run split across multiple requests
  ran_by          text, -- display name of the logged-in user who triggered this run
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists executions_skill_id_idx on executions (skill_id);
create index if not exists executions_started_at_idx on executions (started_at desc);

alter table skills enable row level security;
alter table executions enable row level security;
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
