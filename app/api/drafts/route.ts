import { NextResponse } from "next/server";
import { folderPath } from "@/lib/config";
import { listDeals } from "@/lib/deals";
import { looksSigned } from "@/lib/filing";
import { withAuth } from "@/lib/session";

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
    })),
    signedWaiting: waiting,
    draftsFolderLink: await storage.webLink(folderPath("drafts")),
    executedFolderLink: await storage.webLink(folderPath("executed")),
  });
});
