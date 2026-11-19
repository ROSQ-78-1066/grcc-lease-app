import { NextResponse } from "next/server";
import { LeaseForm } from "@/lib/lease";
import { generateLoi } from "@/lib/loi";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { form } — merge the LOI template, convert to PDF, save to Pending Deals/<Unit - Tenant>/
export const POST = withAuth(async (session, storage, req) => {
  const { form } = (await req.json()) as { form: LeaseForm };
  if (!form?.suiteNumber || !form?.tenantLegalName) return NextResponse.json({ error: "Suite and tenant name are needed for an LOI." }, { status: 422 });
  const name = `${session.user.firstName} ${session.user.lastName}`.trim() || session.user.username;
  return NextResponse.json(await generateLoi(storage, form, { name, email: session.user.email }));
});
