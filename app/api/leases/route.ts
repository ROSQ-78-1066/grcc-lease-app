import { NextResponse } from "next/server";
import { folderPath } from "@/lib/config";
import { withAuth } from "@/lib/session";
import { FileEntry } from "@/lib/storage/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DOC_RE = /\.(pdf|docx?)$/i;

async function safeList(storage: { listFiles(p: string, d: number): Promise<FileEntry[]> }, path: string, depth: number) {
  try {
    return (await storage.listFiles(path, depth)).filter((f) => DOC_RE.test(f.name) && !f.name.startsWith("~$"));
  } catch {
    return [];
  }
}

// Short per-user cache: scanning OLD LEASES takes several seconds.
const CACHE = new Map<string, { at: number; body: unknown }>();
const TTL = 5 * 60_000;

// GET — every lease file in CURRENT LEASES and OLD LEASES (the browser filters by unit).
// Listed once per page visit, so picking suites stays instant.
export const GET = withAuth(async (session, storage, req) => {
  const key = session.user.email || session.user.username;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL && !new URL(req.url).searchParams.has("fresh")) return NextResponse.json(hit.body);
  const current = folderPath("currentLeases");
  const old = folderPath("oldLeases");
  const [c, o] = await Promise.all([safeList(storage, current, 2), safeList(storage, old, 4)]);
  const shape = (root: string, source: "current" | "old") => (f: FileEntry) => ({
    name: f.name,
    path: f.path,
    display: f.path.slice(root.length + 1),
    modified: f.modified || "",
    source,
  });
  const body = { files: [...c.map(shape(current, "current")), ...o.map(shape(old, "old"))] };
  CACHE.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
});
