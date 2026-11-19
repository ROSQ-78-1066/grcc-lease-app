import { NextResponse } from "next/server";
import { folderPath } from "@/lib/config";
import { deleteDeal, listDeals, loadDeal } from "@/lib/deals";
import { looksSigned } from "@/lib/filing";
import { withAuth } from "@/lib/session";
import { StorageError } from "@/lib/storage/types";

export const runtime = "nodejs";

// GET — deals for the dashboard, plus any signed PDFs waiting to be filed
export const GET = withAuth(async (_s, storage) => {
  const deals = await listDeals(storage);
  let waiting: string[] = [];
  try {
    waiting = (await storage.list(folderPath("drafts"))).files.filter((f) => looksSigned(f.name)).map((f) => f.name);
  } catch {}
  return NextResponse.json({
    deals: deals.map((d) => ({
      key: d.key,
      suite: d.form.suiteNumber,
      tenant: d.form.tenantLegalName,
      template: d.form.template,
      dealType: d.form.dealType,
      status: d.status,
      updatedAt: d.updatedAt,
      createdBy: d.createdBy.name,
      docxPath: d.docxPath,
      pdfPath: d.pdfPath,
      executedPath: d.executedPath,
      loi: d.loi ? { docxPath: d.loi.docxPath, pdfPath: d.loi.pdfPath, signedPath: d.loi.signedPath } : null,
      signing: d.signing ?? {},
    })),
    signedWaiting: waiting,
    draftsFolderLink: await storage.webLink(folderPath("drafts")),
    executedFolderLink: await storage.webLink(folderPath("executed")),
  });
});

// DELETE ?key= — remove a draft lease (.docx, .pdf) and its record. Executed leases and
// drafts that are out for signature can't be deleted.
export const DELETE = withAuth(async (_s, storage, req) => {
  const key = new URL(req.url).searchParams.get("key") || "";
  const rec = await loadDeal(storage, key);
  if (!rec) throw new StorageError("Draft not found", 404);
  if (rec.status === "executed") throw new StorageError("Executed leases can't be deleted from the app.", 409);
  if (rec.signing?.lease?.status === "out" || rec.signing?.loi?.status === "out")
    throw new StorageError("This deal is out for signature. Cancel the signing first.", 409);
  const removed = await deleteDeal(storage, rec);
  return NextResponse.json({ ok: true, removed });
});
