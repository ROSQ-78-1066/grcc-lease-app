import { NextResponse } from "next/server";
import { folderPath } from "@/lib/config";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";

const KEYS = { currentLeases: "currentLeases", pendingDeals: "pendingDeals", drafts: "drafts", executed: "executed" } as const;
const DOC_RE = /\.(pdf|docx|doc|png|jpe?g|txt)$/i;

// GET /api/files?folder=currentLeases|pendingDeals|drafts|executed
export const GET = withAuth(async (_s, storage, req) => {
  const key = new URL(req.url).searchParams.get("folder") as keyof typeof KEYS;
  if (!KEYS[key]) return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
  const path = folderPath(KEYS[key]);
  const files = (await storage.listFiles(path, 2))
    .filter((f) => DOC_RE.test(f.name) && !f.name.startsWith("~$"))
    .map((f) => ({ ...f, display: f.path.slice(path.length + 1) }))
    .sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
  return NextResponse.json({ folder: path, files });
});
