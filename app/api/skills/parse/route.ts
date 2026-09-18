import { NextRequest, NextResponse } from "next/server";
import { parseSkillPost } from "@/lib/parseSkillPost";
import type { SkillPostAttachment } from "@/lib/parseSkillPost";

// Route Handlers don't apply the old Pages API's bodyParser size limit, but
// the platform's own request-body cap (Vercel's default is a few MB) binds
// first regardless of anything in this file — see README's "Adding images,
// videos, and files when creating a skill" for the practical size guidance
// (a screenshot or a short clip is fine; a large video will likely 413
// before this route even runs).
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  let postContent = "";
  let attachments: SkillPostAttachment[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const rawPostContent = form.get("postContent");
    postContent = typeof rawPostContent === "string" ? rawPostContent.trim() : "";

    const files = form.getAll("attachments").filter((f): f is File => f instanceof File);
    attachments = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mimeType: file.type,
        bytes: await file.arrayBuffer(),
      }))
    );
  } else {
    const body = await req.json().catch(() => ({}));
    postContent = typeof body.postContent === "string" ? body.postContent.trim() : "";
  }

  if (!postContent && attachments.length === 0) {
    return NextResponse.json({ error: "postContent or at least one attachment is required" }, { status: 400 });
  }

  try {
    const proposal = await parseSkillPost(postContent, attachments);
    return NextResponse.json(proposal);
  } catch (err) {
    console.error("POST /api/skills/parse failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse post" },
      { status: 500 }
    );
  }
}
