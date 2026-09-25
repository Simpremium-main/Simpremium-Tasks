import { fetchApiFieldValue } from "./apiFieldSource";
import type { InputField, Skill, SkillSchedule } from "./types";

/**
 * Whether `schedule` should have already fired as of `now`, given it last
 * actually ran at `lastRunAt`. Deliberately not precise-to-the-minute: the
 * cron route (GET /api/cron/run-scheduled) can be invoked anywhere from
 * every few minutes to once a day depending on the Vercel plan it runs
 * under, so this checks "due since last run", not "due right now" — calling
 * it repeatedly within the same day/week is safe and won't double-fire,
 * since a run that already happened today (or this week) moves lastRunAt
 * past the window.
 */
export function isDue(schedule: SkillSchedule, now: Date, lastRunAt: Date | null): boolean {
  const [hourStr, minuteStr] = schedule.time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;

  if (schedule.frequency === "weekly" && now.getUTCDay() !== schedule.dayOfWeek) {
    return false;
  }

  const scheduledToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute)
  );
  if (now < scheduledToday) return false;
  return !lastRunAt || lastRunAt < scheduledToday;
}

/** A skill can't be scheduled if it has a required "secret" input field —
 *  secret values are never persisted (see lib/mask.ts), so there's nothing
 *  safe for an unattended run to send. Non-required secret fields are fine:
 *  they'll just be left out of the scheduled prompt, same as a person
 *  skipping an optional field. */
export function hasUnschedulableSecret(schema: InputField[]): boolean {
  return schema.some((f) => f.type === "secret" && f.required);
}

/**
 * The actual input values a scheduled run should use right now — static
 * saved values (scheduleInputValues) plus any API-sourced fields
 * (scheduleApiSources) fetched fresh, this instant. Shared by the cron
 * route and "Testar agora" (via POST /api/skills/[id]/schedule/resolve-values)
 * so both use identical logic — a manual test genuinely reflects what the
 * real scheduled run would do, API sources included. On any API field
 * failure, stops and returns the error rather than a partial result: same
 * "never simulate a result" rule as everywhere else in this app.
 *
 * A field can have more than one source (e.g. two separate upstream queues
 * that both feed the same "linhas" list) — each is fetched and its
 * resulting text joined with "\n", same separator a single source's own
 * "list" mapping already uses between rows, so the combined value just
 * reads like more rows appended.
 */
export async function resolveScheduledInputValues(
  skill: Skill
): Promise<{ values: Record<string, string> } | { error: string }> {
  const values: Record<string, string> = { ...(skill.scheduleInputValues ?? {}) };

  // Every field, and every source within a field, is independent of every
  // other — fetched concurrently rather than one at a time, so a field with
  // several upstream sources (the whole point of allowing more than one)
  // doesn't multiply the wall-clock time of a scheduled run or a manual
  // "Testar agora" click. Promise.all keeps each source's result in its
  // original array position regardless of which resolves first, so the
  // joined "\n" order is unaffected.
  try {
    await Promise.all(
      Object.entries(skill.scheduleApiSources ?? {}).map(async ([key, sources]) => {
        const parts = await Promise.all(
          sources.map(async (source) => {
            try {
              return await fetchApiFieldValue(source, { skillId: skill.id, fieldKey: key });
            } catch (err) {
              throw new Error(
                `Falha ao buscar "${key}" da API (${source.url}): ${
                  err instanceof Error ? err.message : "erro desconhecido"
                }`
              );
            }
          })
        );
        values[key] = parts.filter(Boolean).join("\n");
      })
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido ao buscar valores via API" };
  }

  return { values };
}

export const SCHEDULE_DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function describeSchedule(schedule: SkillSchedule): string {
  const day = schedule.frequency === "weekly" ? `toda ${SCHEDULE_DAYS[schedule.dayOfWeek ?? 0]}` : "todo dia";
  return `${day}, por volta de ${schedule.time} UTC`;
}

/** The next UTC instant this schedule should fire at, from `now` — used only
 *  to show a rough "próxima execução" estimate in the UI; the cron route
 *  itself uses isDue(), not this, to decide whether to actually run. */
export function nextDueAt(schedule: SkillSchedule, now: Date): Date {
  const [hourStr, minuteStr] = schedule.time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute)
  );

  if (schedule.frequency === "daily") {
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }

  const targetDay = schedule.dayOfWeek ?? 0;
  let daysAhead = (targetDay - candidate.getUTCDay() + 7) % 7;
  if (daysAhead === 0 && candidate <= now) daysAhead = 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
  return candidate;
}
