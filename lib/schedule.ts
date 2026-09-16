import type { InputField, SkillSchedule } from "./types";

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
