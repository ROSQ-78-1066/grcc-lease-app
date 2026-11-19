import { NextResponse } from "next/server";
import { APP_FIELDS, CERTIFY_TEXT, fileKind, linkOpen, loadLink, submitApplication, UPLOAD_LIMITS } from "@/lib/applications";
import { clientIp, linkStorage, openLink } from "@/lib/links";
import { publicError, PublicError } from "@/lib/publicRoute";

export const runtime = "nodejs";
export const maxDuration = 120;
type Ctx = { params: Promise<{ token: string }> };

async function ctx(token: string) {
  const p = await openLink(token, "apply");
  if (!p) throw new PublicError("This application link is not valid or has expired. Please contact the leasing broker.", 404);
  const storage = linkStorage(p);
  const rec = await loadLink(storage, p.id);
  if (!rec) throw new PublicError("This application link is not valid. Please contact the leasing broker.", 404);
  return { storage, rec };
}

// GET — form definition and context
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { rec } = await ctx((await params).token);
    const closed = linkOpen(rec);
    return NextResponse.json({
      closed,
      suite: rec.suite,
      streetNumber: rec.streetNumber,
      prospect: rec.prospect,
      prospectEmail: rec.prospectEmail,
      broker: rec.createdBy.name,
      expiresAt: rec.expiresAt,
      fields: APP_FIELDS,
      certify: CERTIFY_TEXT,
      limits: UPLOAD_LIMITS,
    });
  } catch (e) {
    return publicError(e);
  }
}

// POST multipart — answers (field keys), signedName, certify=1, files[]
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { storage, rec } = await ctx((await params).token);
    const closed = linkOpen(rec);
    if (closed) throw new PublicError(closed, 410);
    const fd = await req.formData();

    const values: Record<string, string> = {};
    for (const s of APP_FIELDS)
      for (const f of s.fields) {
        const v = String(fd.get(f.key) || "").trim().slice(0, f.type === "textarea" ? 2000 : 300);
        if (f.required && !v) throw new PublicError(`Please fill in: ${f.label}`);
        values[f.key] = v;
      }
    if (values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) throw new PublicError("Please enter a valid email address.");
    const signedName = String(fd.get("signedName") || "").trim().slice(0, 120);
    if (fd.get("certify") !== "1" || !signedName) throw new PublicError("Please check the certification box and type your name to sign.");

    const files: { name: string; data: Buffer }[] = [];
    let total = 0;
    for (const f of fd.getAll("files")) {
      if (typeof f === "string" || !f.size) continue;
      if (f.size > UPLOAD_LIMITS.maxFileMb * 1024 * 1024) throw new PublicError(`${f.name} is larger than ${UPLOAD_LIMITS.maxFileMb} MB.`);
      total += f.size;
      const data = Buffer.from(await f.arrayBuffer());
      if (!fileKind(f.name, data)) throw new PublicError(`${f.name}: only PDF, Word (.doc, .docx) and image (.jpg, .png, .heic) files can be uploaded.`);
      files.push({ name: f.name, data });
    }
    if (files.length > UPLOAD_LIMITS.maxFiles) throw new PublicError(`Please upload at most ${UPLOAD_LIMITS.maxFiles} files.`);
    if (total > UPLOAD_LIMITS.maxTotalMb * 1024 * 1024) throw new PublicError(`Uploads total more than ${UPLOAD_LIMITS.maxTotalMb} MB. Please send fewer or smaller files.`);

    const r = await submitApplication(storage, rec, values, signedName, files, clientIp(req));
    return NextResponse.json({ ok: true, files: r.files.length });
  } catch (e) {
    return publicError(e);
  }
}
