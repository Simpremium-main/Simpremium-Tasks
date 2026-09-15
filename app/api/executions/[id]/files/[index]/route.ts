import { NextRequest, NextResponse } from "next/server";
import { downloadExecutionFile, getExecution } from "@/lib/data";

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
