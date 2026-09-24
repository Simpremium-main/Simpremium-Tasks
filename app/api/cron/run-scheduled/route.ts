import { NextRequest, NextResponse } from "next/server";
import { createExecution, listScheduledSkills, updateSkill } from "@/lib/data";
import { runSkillMaybeSplit } from "@/lib/runSkill";
import { isDue, hasUnschedulableSecret, resolveScheduledInputValues } from "@/lib/schedule";
import { notifyScheduleFailure } from "@/lib/notify";

export const dynamic = "force-dynamic";
// Same reasoning as the other run routes — see app/api/skills/[id]/run/route.ts.
export const maxDuration = 300;

/**
 * Checked by Vercel Cron (see vercel.json) on whatever cadence the account's
 * plan allows — not necessarily every minute, see lib/schedule.ts's isDue()
 * for why that's fine. Runs every skill whose schedule is due, one at a
 * time (not in parallel, to avoid bursting rate limits if several skills
 * are due in the same tick), through the same runSkill() path a script
 * calling POST /api/skills/[id]/run uses — full execution history, same as
 * any other run, tagged source: "scheduled" to tell them apart.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const results: { skillId: string; name: string; ran: boolean; status?: string; reason?: string }[] = [];

  try {
    const skills = await listScheduledSkills();

    for (const skill of skills) {
      if (!skill.schedule || !isDue(skill.schedule, now, skill.scheduleLastRunAt)) continue;

      if (hasUnschedulableSecret(skill.inputSchema ?? [])) {
        results.push({
          skillId: skill.id,
          name: skill.name,
          ran: false,
          reason: "Precisa de um campo secreto obrigatório — não dá pra rodar sem supervisão.",
        });
        continue;
      }

      // Stamped before dispatch, same "record the attempt first" reasoning
      // as startExecution in lib/runSkill.ts — if the run itself throws or
      // this whole request gets killed partway through the loop, a skill
      // already marked as attempted this slot won't be retried every time
      // the cron ticks again for the rest of the day/week.
      await updateSkill(skill.id, { scheduleLastRunAt: now });

      try {
        // API-sourced fields (lib/apiFieldSource.ts) are resolved fresh
        // right here, every time — never cached, never resolved ahead of
        // time — so a scheduled run always reflects whatever the external
        // system says right now. A fetch/mapping failure becomes a real
        // "error" execution (via createExecution directly, bypassing
        // runSkill/dispatch entirely since there's no real prompt to send
        // yet) rather than a silent skip — this app's own rule that every
        // attempt gets recorded applies here just as much as to a dispatch
        // failure.
        const resolved = await resolveScheduledInputValues(skill);
        if ("error" in resolved) {
          const execution = await createExecution({
            skillId: skill.id,
            status: "error",
            source: "scheduled",
            inputValues: skill.scheduleInputValues ?? null,
            promptSnapshot: "(execução não chegou a montar o prompt — falhou buscando valores via API antes de rodar)",
            result: null,
            error: resolved.error,
            files: null,
            ranBy: "Agendamento",
          });
          results.push({ skillId: skill.id, name: skill.name, ran: true, status: "error" });
          await notifyScheduleFailure(skill, execution);
          continue;
        }

        // Usually one execution — more than one only when Skill.accountSplit
        // split this run's rows across several accounts (see
        // lib/runSkill.ts's runSkillMaybeSplit); each is notified/reported
        // independently, same as if they'd been separate scheduled skills.
        const executions = await runSkillMaybeSplit(skill, resolved.values, "Agendamento", "scheduled");
        for (const execution of executions) {
          results.push({ skillId: skill.id, name: skill.name, ran: true, status: execution.status });
          if (execution.status === "error" || execution.status === "needs_setup") {
            await notifyScheduleFailure(skill, execution);
          }
        }
      } catch (err) {
        results.push({
          skillId: skill.id,
          name: skill.name,
          ran: false,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ checkedAt: now.toISOString(), results });
  } catch (err) {
    console.error("GET /api/cron/run-scheduled failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run scheduled skills" },
      { status: 500 }
    );
  }
}
