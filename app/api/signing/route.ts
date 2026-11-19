import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { loadDeal } from "@/lib/deals";
import { emailEnabled } from "@/lib/email";
import { withAuth } from "@/lib/session";
import { createEnvelope, DocKind, loadEnvelope, NewSigner, signerLink } from "@/lib/signing";
import { StorageError } from "@/lib/storage/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const who = (u: { firstName: string; lastName: string; username: string }) => `${u.firstName} ${u.lastName}`.trim() || u.username;

// GET ?key=&kind= — envelope status for the broker (with the current signer's link to copy)
export const GET = withAuth(async (session, storage, req) => {
  const u = new URL(req.url);
  const deal = await loadDeal(storage, u.searchParams.get("key") || "");
  if (!deal) throw new StorageError("Deal not found", 404);
  const kind = (u.searchParams.get("kind") || "lease") as DocKind;
  const ref = deal.signing?.[kind];
  const env = ref ? await loadEnvelope(storage, ref.id) : null;
  const f = deal.form;
  const defaults: NewSigner[] = [{ role: "tenant", anchor: 1, name: f.tenantSignerName, email: f.tenantEmail }];
  if (kind === "lease" && f.guarantorCount >= 1) defaults.push({ role: "guarantor", anchor: 3, name: f.guarantor1Name, email: "" });
  if (kind === "lease" && f.guarantorCount >= 2) defaults.push({ role: "guarantor", anchor: 4, name: f.guarantor2Name, email: "" });
  defaults.push({ role: "landlord", anchor: 2, name: f.landlordSignerName || config.lease.landlordSignerName, email: config.lease.landlordSignerEmail });
  return NextResponse.json({
    emailEnabled: emailEnabled(),
    hasPdf: !!(kind === "lease" ? deal.pdfPath : deal.loi?.pdfPath),
    defaults,
    individualTenant: !!f.tenantIsIndividual,
    envelope: env && {
      id: env.id,
      status: env.status,
      title: env.title,
      sentAt: env.sentAt,
      completedAt: env.completedAt,
      finalPath: env.finalPath,
      current: env.current,
      signers: env.signers.map((s) => ({ role: s.role, name: s.name, email: s.email, status: s.status, signedAt: s.signedAt, viewedAt: s.viewedAt, method: s.method })),
      currentLink: env.status === "out" ? await signerLink(env, env.current, session.token) : null,
      events: env.events.slice(-12),
    },
  });
});

// POST { key, kind, signers: NewSigner[], message } — send for signature
export const POST = withAuth(async (session, storage, req) => {
  const { key, kind, signers, message } = (await req.json()) as { key: string; kind: DocKind; signers: NewSigner[]; message?: string };
  const deal = await loadDeal(storage, key);
  if (!deal) throw new StorageError("Deal not found. Generate the draft first.", 404);
  if (kind !== "lease" && kind !== "loi") throw new StorageError("Unknown document", 400);
  const allowed: Record<string, number[]> = { tenant: [1], landlord: [2], guarantor: [3, 4] };
  for (const s of signers || []) if (!allowed[s.role]?.includes(s.anchor)) throw new StorageError("Invalid signer", 400);
  const { env, link, emailed } = await createEnvelope(
    storage,
    deal,
    kind,
    signers,
    { name: who(session.user), email: session.user.email },
    message || "",
    session.token,
  );
  return NextResponse.json({ id: env.id, link, emailed, firstSigner: env.signers[0].name });
});
