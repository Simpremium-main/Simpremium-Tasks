import type { Execution, ExecutionStatus, ExecutionSource, InputField, Skill } from "./types";

/**
 * Mock data layer — every skill/execution lives in memory for now.
 *
 * This is the ONE seam the rest of the app talks to for persistence
 * (pages and API routes import from here, never touch storage directly).
 * The plan is to back this with Supabase; when that's wired up, only this
 * file's internals change — the function signatures below become the
 * Supabase queries and every caller stays the same. See supabase/schema.sql
 * for the target table shape this mock already mirrors.
 *
 * Data resets whenever the server process restarts (or on every request in
 * serverless environments like Vercel, where each invocation can get a
 * fresh module instance) — that's expected of "mock data for now" and goes
 * away once Supabase is connected.
 */

interface Store {
  skills: Skill[];
  executions: Execution[];
}

const globalForStore = globalThis as unknown as { __skillsHubStore?: Store };

function randomId(): string {
  return crypto.randomUUID();
}

// Fixed on purpose (not randomId()) — the mock store gets re-seeded on every
// cold start/redeploy, so a random id here would break this skill's URL
// every time. A stable id keeps the demo skill reachable at the same link
// even though the store itself still isn't durable — see lib/data.ts's
// module comment. Skills created afterwards still get a random id and are
// still only as durable as the mock store.
const SEED_SKILL_ID = "seed-relatorio-vendas";

function seedStore(): Store {
  const now = new Date();
  const skillId = SEED_SKILL_ID;

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

  return {
    skills: [
      {
        id: skillId,
        name: "Relatório Semanal de Vendas (PDF)",
        description:
          "Gera um PDF resumindo a performance de vendas no período informado — tirado do " +
          "post do chefe no Instagram sobre uma skill de relatórios da Claude.",
        status: "draft",
        needsInput: true,
        usesCowork: false,
        promptTemplate:
          "Gere um relatório de vendas em PDF para {{periodo}}. Inclua receita, produtos mais " +
          "vendidos e a tendência comparada ao período anterior. {{foco}}",
        inputSchema,
        sourcePost:
          "(exemplo) Achei essa skill da Claude — cola seus números de vendas e ela cospe um " +
          "PDF limpo em minutos. Mudou o jogo pras revisões semanais.",
        confirmedOnce: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    executions: [],
  };
}

function getStore(): Store {
  if (!globalForStore.__skillsHubStore) {
    globalForStore.__skillsHubStore = seedStore();
  }
  return globalForStore.__skillsHubStore;
}

export async function listSkills(): Promise<(Skill & { _count: { executions: number } })[]> {
  const store = getStore();
  return [...store.skills]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((skill) => ({
      ...skill,
      _count: { executions: store.executions.filter((e) => e.skillId === skill.id).length },
    }));
}

export async function getSkill(id: string): Promise<Skill | null> {
  const store = getStore();
  return store.skills.find((s) => s.id === id) ?? null;
}

export async function getSkillWithExecutions(
  id: string
): Promise<(Skill & { executions: Execution[] }) | null> {
  const store = getStore();
  const skill = store.skills.find((s) => s.id === id);
  if (!skill) return null;
  const executions = store.executions
    .filter((e) => e.skillId === id)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return { ...skill, executions };
}

export interface CreateSkillInput {
  name: string;
  description: string;
  promptTemplate: string;
  needsInput: boolean;
  usesCowork: boolean;
  inputSchema: InputField[];
  sourcePost: string | null;
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const store = getStore();
  const now = new Date();
  const skill: Skill = {
    id: randomId(),
    name: input.name,
    description: input.description,
    promptTemplate: input.promptTemplate,
    needsInput: input.needsInput,
    usesCowork: input.usesCowork,
    inputSchema: input.inputSchema.length ? input.inputSchema : null,
    sourcePost: input.sourcePost,
    status: "draft",
    confirmedOnce: false,
    createdAt: now,
    updatedAt: now,
  };
  store.skills.unshift(skill);
  return skill;
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
}

export async function updateSkill(id: string, patch: UpdateSkillInput): Promise<Skill | null> {
  const store = getStore();
  const skill = store.skills.find((s) => s.id === id);
  if (!skill) return null;
  Object.assign(skill, patch, { updatedAt: new Date() });
  return skill;
}

export async function deleteSkill(id: string): Promise<boolean> {
  const store = getStore();
  const idx = store.skills.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  store.skills.splice(idx, 1);
  store.executions = store.executions.filter((e) => e.skillId !== id);
  return true;
}

export interface ListExecutionsFilter {
  status?: string;
  skillId?: string;
}

export async function listExecutions(
  filter: ListExecutionsFilter = {}
): Promise<(Execution & { skill: { id: string; name: string } })[]> {
  const store = getStore();
  return store.executions
    .filter((e) => (filter.status ? e.status === filter.status : true))
    .filter((e) => (filter.skillId ? e.skillId === filter.skillId : true))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, 200)
    .map((e) => {
      const skill = store.skills.find((s) => s.id === e.skillId);
      return { ...e, skill: { id: skill?.id ?? e.skillId, name: skill?.name ?? "Deleted skill" } };
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
}

export async function createExecution(input: CreateExecutionInput): Promise<Execution> {
  const store = getStore();
  const execution: Execution = {
    id: randomId(),
    skillId: input.skillId,
    status: input.status,
    source: input.source,
    inputValues: input.inputValues,
    promptSnapshot: input.promptSnapshot,
    result: input.result,
    error: input.error,
    startedAt: new Date(),
    finishedAt: new Date(),
  };
  store.executions.unshift(execution);
  return execution;
}
