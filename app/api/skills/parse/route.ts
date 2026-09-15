import { NextRequest, NextResponse } from "next/server";
import { parseSkillPost } from "@/lib/parseSkillPost";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const postContent = typeof body.postContent === "string" ? body.postContent.trim() : "";

  if (!postContent) {
    return NextResponse.json({ error: "postContent is required" }, { status: 400 });
  }

  try {
    const proposal = await parseSkillPost(postContent);
    return NextResponse.json(proposal);
  } catch (err) {
    console.error("POST /api/skills/parse failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse post" },
      { status: 500 }
    );
  }
}
