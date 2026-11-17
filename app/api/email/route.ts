import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { loadDeal, saveDeal } from "@/lib/deals";
import { emailEnabled, sendMail } from "@/lib/email";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";

// POST { key, to[], subject, message, attach: "pdf" | "docx" | "both" }
export const POST = withAuth(async (session, storage, req) => {
  const { key, to, subject, message, attach } = (await req.json()) as {
    key: string;
    to: string[];
    subject: string;
    message: string;
    attach?: "pdf" | "docx" | "both";
  };
  if (!emailEnabled()) return NextResponse.json({ error: "Email is not configured", fallback: "mailto" }, { status: 400 });
  const rec = await loadDeal(storage, key);
  if (!rec) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const attachments = [];
  const wantPdf = attach !== "docx" && rec.pdfPath;
  const wantDocx = attach === "docx" || attach === "both" || !rec.pdfPath;
  if (wantPdf) attachments.push({ filename: rec.pdfPath!.split("/").pop()!, content: await storage.download(rec.pdfPath!) });
  if (wantDocx) attachments.push({ filename: rec.docxPath.split("/").pop()!, content: await storage.download(rec.docxPath) });

  await sendMail({
    to,
    cc: session.user.email ? [session.user.email] : [],
    replyTo: session.user.email || undefined,
    subject,
    text: message,
    attachments,
  });
  rec.log.push({ at: new Date().toISOString(), event: `Draft emailed to ${to.join(", ")}` });
  await saveDeal(storage, rec);
  return NextResponse.json({ ok: true, landlord: config.lease.landlordEmail });
});
