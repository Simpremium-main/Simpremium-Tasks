import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The code-level equivalent of Vercel Dashboard → Settings → Data Cache →
 * "Purge Everything", for whoever would rather trigger it from inside the
 * app than go find that button. revalidatePath("/", "layout") invalidates
 * the root layout and — because Next.js cache invalidation cascades down
 * to every nested route/layout under it — every page in the app, not just
 * skills/executions. Vercel's Next.js integration propagates this to the
 * Edge Network cache too, not just the in-process one, so this actually
 * clears what shows up as CDN staleness (see README.md's "Update — a
 * second, more likely cause..." note on app/api/skills/route.ts etc. for
 * the bug that used to cause that staleness in the first place).
 */
export async function POST() {
  try {
    await requireAdmin();
    revalidatePath("/", "layout");
    return NextResponse.json({ purged: true, at: new Date().toISOString() });
  } catch (err) {
    console.error("POST /api/admin/purge-cache failed:", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    const status = message.includes("Admin access required") || message.includes("Not signed in") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
