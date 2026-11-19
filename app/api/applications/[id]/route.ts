import { NextResponse } from "next/server";
import { loadLink, saveLink } from "@/lib/applications";
import { withAuth } from "@/lib/session";
import { StorageError } from "@/lib/storage/types";

export const runtime = "nodejs";

// POST { action: "revoke" }
export const POST = withAuth(async (_s, storage, req, { params }: { params: Promise<{ id: string }> }) => {
  const rec = await loadLink(storage, (await params).id);
  if (!rec) throw new StorageError("Link not found", 404);
  const { action } = (await req.json()) as { action: string };
  if (action !== "revoke") throw new StorageError("Unknown action", 400);
  rec.status = "revoked";
  await saveLink(storage, rec);
  return NextResponse.json({ ok: true });
});
