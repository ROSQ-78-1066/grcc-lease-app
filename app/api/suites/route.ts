import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { ColumnMapping, readSuites, saveMapping } from "@/lib/excel";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";

// GET: suites parsed from the master workbook in /Config
export const GET = withAuth(async (_s, storage) => {
  const info = await readSuites(storage);
  return NextResponse.json({
    ...info,
    defaults: {
      nnnRate: config.lease.defaultNnnRate,
      totalBuildingSqFt: config.lease.totalBuildingSqFt,
      landlordSignerName: config.lease.landlordSignerName,
      landlordSignerTitle: config.lease.landlordSignerTitle,
      landlordEmail: config.lease.landlordReviewEmail,
    },
  });
});

// POST { mapping, save?: boolean } — preview (and optionally save) a column mapping
export const POST = withAuth(async (_s, storage, req) => {
  const { mapping, save } = (await req.json()) as { mapping: ColumnMapping; save?: boolean };
  if (save) await saveMapping(storage, mapping);
  const info = await readSuites(storage, mapping);
  return NextResponse.json({ ...info, mappingSaved: !!save });
});
