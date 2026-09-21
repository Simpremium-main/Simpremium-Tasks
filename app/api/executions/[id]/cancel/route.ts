import { NextRequest, NextResponse } from "next/server";
import { cancelExecution } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Manually cancels a "pending"/"running" execution — see lib/data.ts's
 * cancelExecution for why this exists (it's the UI replacement for reaching
 * into Supabase by hand). Normal session auth, like every other mutation
 * route under /api/executions — not the Mac mini agent's bearer token.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  try {
    const execution = await cancelExecution(params.id, user?.displayName ?? null);
    if (!execution) {
      return NextResponse.json(
        { error: "Execução não encontrada, ou já não estava pendente/rodando" },
        { status: 404 }
      );
    }
    return NextResponse.json(execution);
  } catch (err) {
    console.error(`POST /api/executions/${params.id}/cancel failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to cancel execution" },
      { status: 500 }
    );
  }
}
