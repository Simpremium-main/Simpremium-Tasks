-- Target schema for Skills Hub once it's connected to Supabase.
--
-- Not wired up yet — the app currently runs on the in-memory mock store in
-- lib/data.ts, which mirrors these two tables field-for-field so the swap
-- is mechanical: implement lib/data.ts's exported functions against the
-- Supabase JS client instead of the mock arrays, and every page/API route
-- that calls them keeps working unchanged.
--
-- Run this in the Supabase SQL editor (or as a migration) when the project
-- is ready to connect a real Supabase instance.

create extension if not exists pgcrypto;

create table if not exists skills (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null default '',
  status          text not null default 'draft' check (status in ('draft', 'active')),
  needs_input     boolean not null default false,
  uses_cowork     boolean not null default false,
  prompt_template text not null,
  input_schema    jsonb, -- InputField[] | null, see lib/types.ts
  source_post     text,
  confirmed_once  boolean not null default false,
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
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists executions_skill_id_idx on executions (skill_id);
create index if not exists executions_started_at_idx on executions (started_at desc);

-- Secrets are masked in lib/mask.ts before a row is ever written here — this
-- schema never stores an unmasked credential/token, matching the security
-- baseline in CLAUDE.md regardless of which backend is behind lib/data.ts.
