import { NextResponse } from "next/server";
import { fileExecutedLeases } from "@/lib/filing";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST — manual "Sync / File Executed Copy" button on the dashboard
export const POST = withAuth(async (_s, storage) => {
  return NextResponse.json(await fileExecutedLeases(storage));
});
