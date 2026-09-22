import { NextRequest, NextResponse } from "next/server";
import { downloadExecutionFile, getExecution } from "@/lib/data";

// See app/api/skills/route.ts — same missing-dynamic CDN-caching gap. Files
// are immutable once generated, but the execution row's index→file mapping
// isn't (a retried/edited run can change which file sits at which index),
// so a cached response here could still serve the wrong file.
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; index: string } }
) {
  try {
    const execution = await getExecution(params.id);
    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    const index = Number(params.index);
    const file = execution.files?.[index];
    if (!Number.isInteger(index) || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const blob = await downloadExecutionFile(file.storagePath);
    const bytes = Buffer.from(await blob.arrayBuffer());

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.length),
      },
    });
  } catch (err) {
    console.error(`GET /api/executions/${params.id}/files/${params.index} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to download file" },
      { status: 500 }
    );
  }
}
