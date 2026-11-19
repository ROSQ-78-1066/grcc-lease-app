import { NextResponse } from "next/server";
import { config, folderPath, rootPath } from "@/lib/config";
import { DealRecord, loadDeal, saveDeal } from "@/lib/deals";
import { dealKey, LeaseForm, mergeData, missingFields } from "@/lib/lease";
import { mergeDocx } from "@/lib/merge";
import { docxToPdf } from "@/lib/pdf";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { form } → merge template, convert to PDF, save both to /Draft Leases
export const POST = withAuth(async (session, storage, req) => {
  const { form, allowMissing } = (await req.json()) as { form: LeaseForm; allowMissing?: boolean };
  const missing = missingFields(form);
  if (missing.length && !allowMissing)
    return NextResponse.json({ error: "Missing required fields", missing }, { status: 422 });

  const existing = await loadDeal(storage, dealKey(form));
  if (existing?.signing?.lease?.status === "out")
    return NextResponse.json({ error: "This lease is out for signature. Cancel the signing (Dashboard → Signing) before regenerating it." }, { status: 409 });
  if (existing?.status === "executed")
    return NextResponse.json({ error: "This lease has already been executed." }, { status: 409 });

  const templatePath = rootPath(config.templates[form.template]);
  const template = await storage.download(templatePath);
  const docx = mergeDocx(template, mergeData(form));

  const key = dealKey(form);
  const dir = folderPath("drafts");
  const docxPath = `${dir}/${key} - Draft.docx`;
  const pdfPath = `${dir}/${key} - Draft.pdf`;
  const docxEntry = await storage.upload(docxPath, docx);

  const warnings: string[] = [];
  let pdfEntry = null;
  const pdf = await docxToPdf(docx);
  if (pdf) pdfEntry = await storage.upload(pdfPath, pdf);
  else warnings.push("LibreOffice is not installed here, so no PDF was made. (The Docker/Render build includes it.)");

  const prev = await loadDeal(storage, key);
  const now = new Date().toISOString();
  const rec: DealRecord = {
    key,
    form,
    docxPath,
    pdfPath: pdfEntry ? pdfPath : null,
    status: prev?.status ?? "draft",
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    createdBy: prev?.createdBy ?? {
      name: `${session.user.firstName} ${session.user.lastName}`.trim() || session.user.username,
      email: session.user.email,
    },
    executedPath: prev?.executedPath,
    executedAt: prev?.executedAt,
    loi: prev?.loi,
    signing: prev?.signing?.loi ? { loi: prev.signing.loi } : undefined,
    log: [...(prev?.log ?? []), { at: now, event: prev ? "Draft regenerated" : "Draft created" }],
  };
  await saveDeal(storage, rec);

  return NextResponse.json({
    key,
    docxPath,
    pdfPath: rec.pdfPath,
    docxLink: await storage.webLink(docxPath, docxEntry),
    pdfLink: pdfEntry ? await storage.webLink(pdfPath, pdfEntry) : null,
    folderLink: await storage.webLink(dir),
    warnings,
    missing,
  });
});
