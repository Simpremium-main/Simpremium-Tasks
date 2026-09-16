import { NextRequest, NextResponse } from "next/server";
import { listScheduledSkills, updateSkill } from "@/lib/data";
import { runSkill } from "@/lib/runSkill";
import { isDue, hasUnschedulableSecret } from "@/lib/schedule";
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
        const execution = await runSkill(
          skill,
          skill.scheduleInputValues ?? {},
          "Agendamento",
          "scheduled"
        );
        results.push({ skillId: skill.id, name: skill.name, ran: true, status: execution.status });
        if (execution.status === "error" || execution.status === "needs_setup") {
          await notifyScheduleFailure(skill, execution);
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
