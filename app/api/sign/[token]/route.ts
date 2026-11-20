import { NextResponse } from "next/server";
import { clientIp } from "@/lib/links";
import { publicError, PublicError, setVerifiedCookie, signerCtx } from "@/lib/publicRoute";
import { checkCode, codeRequired, markViewed, recordConsent, sendCode, signerView } from "@/lib/signing";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

// GET — what the signer sees before signing
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const c = await signerCtx((await params).token);
    return NextResponse.json({ ...signerView(c.env, c.i), verified: c.verified, codeRequired: codeRequired(c.env) });
  } catch (e) {
    return publicError(e);
  }
}

// POST { action: "code" } | { action: "verify", code } | { action: "consent" }
export async function POST(req: Request, { params }: Ctx) {
  try {
    const c = await signerCtx((await params).token);
    const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string };
    if (c.env.status !== "out") throw new PublicError("This document is no longer out for signature.", 409);

    if (body.action === "code") {
      const to = await sendCode(c.storage, c.env, c.i);
      return NextResponse.json({ ok: true, sentTo: to.replace(/^(.{2}).*(@.*)$/, "$1•••$2") });
    }
    if (body.action === "verify") {
      if (!(await checkCode(c.storage, c.env, c.i, String(body.code || "")))) throw new PublicError("That code isn't right. Please check it and try again.", 400);
      await markViewed(c.storage, c.env, c.i, clientIp(req));
      const res = NextResponse.json({ ok: true });
      await setVerifiedCookie(res, c.env.id, c.i);
      return res;
    }
    if (!c.verified) throw new PublicError("Please enter the code we emailed you first.", 401);
    if (body.action === "consent") {
      await markViewed(c.storage, c.env, c.i, clientIp(req));
      await recordConsent(c.storage, c.env, c.i);
      return NextResponse.json({ ok: true });
    }
    throw new PublicError("Unknown action");
  } catch (e) {
    return publicError(e);
  }
}
