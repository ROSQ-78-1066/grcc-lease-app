import { NextResponse } from "next/server";
import { loadDeal, saveDeal } from "@/lib/deals";
import { docxToPdf } from "@/lib/pdf";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST multipart { key, file } — broker re-uploads a draft they edited in Word.
export const POST = withAuth(async (_s, storage, req) => {
  const fd = await req.formData();
  const key = String(fd.get("key") || "");
  const file = fd.get("file");
  if (!key || !file || typeof file === "string") return NextResponse.json({ error: "Missing key or file" }, { status: 400 });
  if (!/\.docx$/i.test(file.name)) return NextResponse.json({ error: "Please upload a .docx file." }, { status: 400 });

  const rec = await loadDeal(storage, key);
  if (!rec) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const docx = Buffer.from(await file.arrayBuffer());
  const docxEntry = await storage.upload(rec.docxPath, docx);
  const pdfPath = rec.docxPath.replace(/\.docx$/i, ".pdf");
  const pdf = await docxToPdf(docx);
  let pdfEntry = null;
  if (pdf) pdfEntry = await storage.upload(pdfPath, pdf);

  rec.pdfPath = pdfEntry ? pdfPath : rec.pdfPath;
  rec.log.push({ at: new Date().toISOString(), event: `Edited draft uploaded (${file.name})` });
  await saveDeal(storage, rec);

  return NextResponse.json({
    key,
    docxPath: rec.docxPath,
    pdfPath: rec.pdfPath,
    docxLink: await storage.webLink(rec.docxPath, docxEntry),
    pdfLink: pdfEntry ? await storage.webLink(pdfPath, pdfEntry) : null,
    warnings: pdf ? [] : ["LibreOffice is not installed here, so the PDF was not refreshed."],
  });
});
