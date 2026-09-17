import { NextRequest, NextResponse } from "next/server";
import { listPromptVersions } from "@/lib/data";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const versions = await listPromptVersions(params.id);
    return NextResponse.json(versions);
  } catch (err) {
    console.error(`GET /api/skills/${params.id}/prompt-history failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load prompt history" },
      { status: 500 }
    );
  }
}
