import { NextResponse } from "next/server";
import { withAuth } from "@/lib/session";
import { loadEnvelope, resend, voidEnvelope } from "@/lib/signing";
import { StorageError } from "@/lib/storage/types";

export const runtime = "nodejs";

// POST { action: "resend" | "void" }
export const POST = withAuth(async (session, storage, req, { params }: { params: Promise<{ id: string }> }) => {
  const env = await loadEnvelope(storage, (await params).id);
  if (!env) throw new StorageError("Envelope not found", 404);
  const { action } = (await req.json()) as { action: string };
  const by = `${session.user.firstName} ${session.user.lastName}`.trim() || session.user.username;
  if (action === "void") {
    await voidEnvelope(storage, env, by);
    return NextResponse.json({ ok: true });
  }
  if (action === "resend") {
    const r = await resend(storage, env, session.token);
    return NextResponse.json({ ok: true, ...r });
  }
  throw new StorageError("Unknown action", 400);
});
