import { cache } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient";
import type { Execution, ExecutionStatus, ExecutionSource, InputField, Skill } from "./types";

// Supabase's client can return an error with an empty `.message` when the
// request never reached Supabase at all (e.g. blocked by a network policy
// before the TLS handshake, or the tables from supabase/schema.sql haven't
// been created yet) — fall back to the HTTP status so the thrown error is
// still useful instead of a blank string.
function describeError(
  context: string,
  error: PostgrestError,
  status?: number,
  statusText?: string
): Error {
  const detail = error.message || `HTTP ${status ?? "?"} ${statusText ?? ""}`.trim();
  return new Error(`${context}: ${detail}`);
}

/**
 * Data layer — every page and API route goes through these functions for
 * persistence, never touching Supabase directly. That seam is what made
 * the earlier mock-data stage possible, and now makes it easy to see
 * exactly what changed to connect the real thing: this file's internals,
 * nothing else. See supabase/schema.sql for the table definitions these
 * functions read and write.
 */

// Fixed on purpose (not a generated uuid) — this is the one demo skill the
// app seeds itself, and a stable id means its URL never breaks across
// reseeds. Must be a valid uuid since the `skills.id` column is typed uuid.
const SEED_SKILL_ID = "00000000-0000-4000-8000-000000000001";

function mapSkillRow(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    status: row.status as Skill["status"],
    needsInput: Boolean(row.needs_input),
    usesCowork: Boolean(row.uses_cowork),
    promptTemplate: row.prompt_template as string,
    inputSchema: (row.input_schema as InputField[] | null) ?? null,
    sourcePost: (row.source_post as string | null) ?? null,
    confirmedOnce: Boolean(row.confirmed_once),
    group: (row.group as string | null) ?? null,
    tags: (row.tags as string[] | null) ?? [],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapExecutionRow(row: Record<string, unknown>): Execution {
  return {
    id: row.id as string,
    skillId: row.skill_id as string,
    status: row.status as ExecutionStatus,
    source: row.source as ExecutionSource,
    inputValues: (row.input_values as Record<string, string> | null) ?? null,
    promptSnapshot: row.prompt_snapshot as string,
    result: (row.result as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    ranBy: (row.ran_by as string | null) ?? null,
    startedAt: new Date(row.started_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
  };
}

async function ensureSeeded(supabase: SupabaseClient): Promise<void> {
  const { count, error, status, statusText } = await supabase
    .from("skills")
    .select("*", { count: "exact", head: true });
  if (error) throw describeError("ensureSeeded", error, status, statusText);
  if ((count ?? 0) > 0) return;

  const inputSchema: InputField[] = [
    {
      key: "periodo",
      label: "Período do relatório",
      type: "text",
      required: true,
      placeholder: "ex: Q3 2026, ou 1-14 de setembro",
    },
    {
      key: "foco",
      label: "Algo específico pra focar?",
      type: "textarea",
      required: false,
      placeholder: "Opcional — uma região, uma linha de produto, uma métrica",
    },
  ];

  // upsert + ignoreDuplicates rather than a plain insert: Next.js can render
  // the layout and the page concurrently within one request, and both call
  // listSkills() (and therefore this), so two calls can both see count === 0
  // above and both try to create the seed skill at once. A plain insert
  // would have the second one fail on the fixed id's primary key — this is
  // exactly what happened in production. Upsert with ignoreDuplicates makes
  // the race harmless: whichever call loses just no-ops instead of erroring.
  const {
    error: insertError,
    status: insertStatus,
    statusText: insertStatusText,
  } = await supabase.from("skills").upsert(
    {
      id: SEED_SKILL_ID,
      name: "Relatório Semanal de Vendas (PDF)",
      description:
        "Gera um PDF resumindo a performance de vendas no período informado — tirado do " +
        "post do chefe no Instagram sobre uma skill de relatórios da Claude.",
      status: "draft",
      needs_input: true,
      uses_cowork: false,
      prompt_template:
        "Gere um relatório de vendas em PDF para {{periodo}}. Inclua receita, produtos mais " +
        "vendidos e a tendência comparada ao período anterior. {{foco}}",
      input_schema: inputSchema,
      source_post:
        "(exemplo) Achei essa skill da Claude — cola seus números de vendas e ela cospe um " +
        "PDF limpo em minutos. Mudou o jogo pras revisões semanais.",
      confirmed_once: false,
      group: "Relatórios",
      tags: ["vendas", "pdf"],
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (insertError) throw describeError("ensureSeeded insert", insertError, insertStatus, insertStatusText);
}

// Wrapped in React's cache() so that when the layout and the page both call
// listSkills() during the same request (a normal thing for the App Router
// to do concurrently), it only actually hits Supabase once — saves a round
// trip, and incidentally shrinks how often the seeding race above can even
// occur (still safe either way, thanks to the upsert above).
export const listSkills = cache(async (): Promise<
  (Skill & { _count: { executions: number } })[]
> => {
  const supabase = getSupabase();
  await ensureSeeded(supabase);

  const {
    data: skillRows,
    error,
    status,
    statusText,
  } = await supabase.from("skills").select("*").order("created_at", { ascending: false });
  if (error) throw describeError("listSkills", error, status, statusText);

  const {
    data: execRows,
    error: execError,
    status: execStatus,
    statusText: execStatusText,
  } = await supabase.from("executions").select("skill_id");
  if (execError) throw describeError("listSkills (execution counts)", execError, execStatus, execStatusText);

  const counts = new Map<string, number>();
  for (const row of execRows ?? []) {
    const id = row.skill_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (skillRows ?? []).map((row) => ({
    ...mapSkillRow(row),
    _count: { executions: counts.get(row.id as string) ?? 0 },
  }));
});

export async function getSkill(id: string): Promise<Skill | null> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw describeError("getSkill", error, status, statusText);
  return data ? mapSkillRow(data) : null;
}

export async function getSkillWithExecutions(
  id: string
): Promise<(Skill & { executions: Execution[] }) | null> {
  const skill = await getSkill(id);
  if (!skill) return null;

  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .select("*")
    .eq("skill_id", id)
    .order("started_at", { ascending: false });
  if (error) throw describeError("getSkillWithExecutions", error, status, statusText);

  return { ...skill, executions: (data ?? []).map(mapExecutionRow) };
}

export interface CreateSkillInput {
  name: string;
  description: string;
  promptTemplate: string;
  needsInput: boolean;
  usesCowork: boolean;
  inputSchema: InputField[];
  sourcePost: string | null;
  group: string | null;
  tags: string[];
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const supabase = getSupabase();
  const { data, error, status, statusText } = await supabase
    .from("skills")
    .insert({
      name: input.name,
      description: input.description,
      prompt_template: input.promptTemplate,
      needs_input: input.needsInput,
      uses_cowork: input.usesCowork,
      input_schema: input.inputSchema.length ? input.inputSchema : null,
      source_post: input.sourcePost,
      status: "draft",
      confirmed_once: false,
      group: input.group,
      tags: input.tags,
    })
    .select()
    .single();
  if (error) throw describeError("createSkill", error, status, statusText);
  return mapSkillRow(data);
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  promptTemplate?: string;
  needsInput?: boolean;
  usesCowork?: boolean;
  status?: Skill["status"];
  confirmedOnce?: boolean;
  inputSchema?: InputField[] | null;
  group?: string | null;
  tags?: string[];
}

export async function updateSkill(id: string, patch: UpdateSkillInput): Promise<Skill | null> {
  const supabase = getSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.promptTemplate !== undefined) row.prompt_template = patch.promptTemplate;
  if (patch.needsInput !== undefined) row.needs_input = patch.needsInput;
  if (patch.usesCowork !== undefined) row.uses_cowork = patch.usesCowork;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.confirmedOnce !== undefined) row.confirmed_once = patch.confirmedOnce;
  if (patch.inputSchema !== undefined) row.input_schema = patch.inputSchema;
  if (patch.group !== undefined) row.group = patch.group;
  if (patch.tags !== undefined) row.tags = patch.tags;

  const { data, error, status, statusText } = await supabase
    .from("skills")
    .update(row)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw describeError("updateSkill", error, status, statusText);
  return data ? mapSkillRow(data) : null;
}

export async function deleteSkill(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error, count, status, statusText } = await supabase
    .from("skills")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw describeError("deleteSkill", error, status, statusText);
  return (count ?? 0) > 0;
}

export interface ListExecutionsFilter {
  status?: string;
  skillId?: string;
}

export async function listExecutions(
  filter: ListExecutionsFilter = {}
): Promise<(Execution & { skill: { id: string; name: string } })[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("executions")
    .select("*, skill:skills(id, name)")
    .order("started_at", { ascending: false })
    .limit(200);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.skillId) query = query.eq("skill_id", filter.skillId);

  const { data, error, status, statusText } = await query;
  if (error) throw describeError("listExecutions", error, status, statusText);

  return (data ?? []).map((row) => {
    const skill = row.skill as { id: string; name: string } | null;
    return {
      ...mapExecutionRow(row),
      skill: { id: skill?.id ?? (row.skill_id as string), name: skill?.name ?? "Deleted skill" },
    };
  });
}

export interface CreateExecutionInput {
  skillId: string;
  status: ExecutionStatus;
  source: ExecutionSource;
  inputValues: Record<string, string> | null;
  promptSnapshot: string;
  result: string | null;
  error: string | null;
  ranBy: string | null;
}

export async function createExecution(input: CreateExecutionInput): Promise<Execution> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { data, error, status, statusText } = await supabase
    .from("executions")
    .insert({
      skill_id: input.skillId,
      status: input.status,
      source: input.source,
      input_values: input.inputValues,
      prompt_snapshot: input.promptSnapshot,
      result: input.result,
      error: input.error,
      ran_by: input.ranBy,
      started_at: now,
      finished_at: now,
    })
    .select()
    .single();
  if (error) throw describeError("createExecution", error, status, statusText);
  return mapExecutionRow(data);
}
