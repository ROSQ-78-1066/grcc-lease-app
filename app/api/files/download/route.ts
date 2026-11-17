import { isInsideRoot } from "@/lib/config";
import { withAuth } from "@/lib/session";
import { StorageError } from "@/lib/storage/types";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// GET /api/files/download?path=...&inline=1
export const GET = withAuth(async (_s, storage, req) => {
  const u = new URL(req.url);
  const path = u.searchParams.get("path") || "";
  if (!isInsideRoot(path)) throw new StorageError("Path outside the Leasing App folder", 400);
  const buf = await storage.download(path);
  const name = path.split("/").pop() || "file";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const disp = u.searchParams.get("inline") ? "inline" : "attachment";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
});
