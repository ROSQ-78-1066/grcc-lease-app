import { NextResponse } from "next/server";
import { fileKind } from "@/lib/applications";
import { clientIp } from "@/lib/links";
import { publicError, PublicError, signerCtx } from "@/lib/publicRoute";
import { applySignature, recordConsent } from "@/lib/signing";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE = 20 * 1024 * 1024;

// POST multipart: method=typed|drawn|ink, signature=<png data url>, initials, consent=1, files[]
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const c = await signerCtx((await params).token);
    if (!c.verified) throw new PublicError("Please enter the code we emailed you first.", 401);
    const fd = await req.formData();
    if (fd.get("consent") !== "1") throw new PublicError("Please agree to sign electronically first.");
    const method = String(fd.get("method") || "");
    if (!["typed", "drawn", "ink"].includes(method)) throw new PublicError("Choose how you want to sign.");

    let png: Uint8Array | undefined;
    if (method !== "ink") {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(fd.get("signature") || ""));
      if (!m) throw new PublicError("Please add your signature.");
      png = Buffer.from(m[1], "base64");
      if (png.length > 400_000 || png[0] !== 0x89) throw new PublicError("That signature image couldn't be read. Please try again.");
    }
    const initials = String(fd.get("initials") || "").trim().slice(0, 6);

    const uploads: { name: string; data: Buffer }[] = [];
    for (const f of fd.getAll("files")) {
      if (typeof f === "string") continue;
      if (f.size > MAX_FILE) throw new PublicError(`${f.name} is larger than 20 MB.`);
      const data = Buffer.from(await f.arrayBuffer());
      const k = fileKind(f.name, data);
      if (k !== "pdf" && k !== "jpg" && k !== "png") throw new PublicError(`${f.name}: please upload a PDF, JPG or PNG.`);
      uploads.push({ name: f.name, data });
    }
    if (uploads.length > 5) throw new PublicError("Please upload at most 5 files.");

    await recordConsent(c.storage, c.env, c.i);
    const r = await applySignature(
      c.storage,
      c.env,
      c.i,
      { method: method as "typed" | "drawn" | "ink", signaturePng: png, initials, uploads, ip: clientIp(req), userAgent: req.headers.get("user-agent") || "" },
      c.egnyteToken,
    );
    return NextResponse.json({ ok: true, done: r.done });
  } catch (e) {
    return publicError(e);
  }
}
