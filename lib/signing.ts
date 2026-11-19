import { config, folderPath, META_FOLDER } from "./config";
import { DealRecord, loadDeal, saveDeal } from "./deals";
import { emailEnabled, sendMail } from "./email";
import { longDate, safeName } from "./lease";
import { newId, sealLink, sha256Hex } from "./links";
import { AnchorMap, appendCertificate, appendUploads, etTime, findAnchors, pageCount, sealPdf, stampSigner } from "./pdfsign";
import { Storage } from "./storage/types";

export type Role = "tenant" | "guarantor" | "landlord";
export type DocKind = "lease" | "loi";

export interface Signer {
  anchor: number; // 1 tenant, 2 landlord, 3/4 guarantors (matches \sN\ markers)
  role: Role;
  name: string;
  email: string;
  status: "waiting" | "sent" | "signed";
  sentAt?: string;
  viewedAt?: string;
  verifiedAt?: string;
  consentAt?: string;
  signedAt?: string;
  method?: "typed" | "drawn" | "ink";
  initials?: string;
  ip?: string;
  userAgent?: string;
  otp?: { hash: string; exp: number; tries: number; sentAt: number };
  uploads?: string[]; // paths of ink-signed copies / notarized pages this signer uploaded
}

export interface Envelope {
  id: string;
  dealKey: string;
  kind: DocKind;
  title: string; // "Lease – Unit 3568 – Acme LLC"
  suite: string;
  documentName: string;
  status: "out" | "completed" | "voided";
  signers: Signer[]; // in signing order
  current: number; // index into signers of who signs next
  originalSha256: string;
  originalPages: number;
  workingSha256: string;
  anchors: AnchorMap;
  sentBy: { name: string; email: string };
  sentAt: string;
  message: string;
  completedAt?: string;
  finalPath?: string;
  finalSha256?: string;
  voidedAt?: string;
  events: { at: string; event: string }[];
}

export const ROLE_LABEL: Record<Role, string> = { tenant: "Tenant", guarantor: "Guarantor", landlord: "Landlord" };
const LINK_DAYS = 30;
const OTP_MINUTES = 10;

export const envDir = (id: string) => `${folderPath("drafts")}/${META_FOLDER}/signing/${id}`;
const envPath = (id: string) => `${envDir(id)}/envelope.json`;
const workingPath = (id: string) => `${envDir(id)}/working.pdf`;
const originalPath = (id: string) => `${envDir(id)}/original.pdf`;

export async function loadEnvelope(storage: Storage, id: string): Promise<Envelope | null> {
  if (!/^E[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    return JSON.parse((await storage.download(envPath(id))).toString("utf8"));
  } catch {
    return null;
  }
}

async function saveEnvelope(storage: Storage, env: Envelope) {
  await storage.upload(envPath(env.id), Buffer.from(JSON.stringify(env, null, 2)));
}

export async function workingPdf(storage: Storage, env: Envelope): Promise<Buffer> {
  const buf = await storage.download(workingPath(env.id));
  if ((await sha256Hex(buf)) !== env.workingSha256)
    throw new Error("The document in progress was changed outside the app, so signing has stopped. Please cancel and send it again.");
  return buf;
}

export async function signerLink(env: Envelope, i: number, egnyteToken: string): Promise<string> {
  const token = await sealLink({ k: "sign", id: env.id, s: i, t: egnyteToken }, LINK_DAYS);
  return `${config.appUrl}/sign/${token}`;
}

export const signerLabel = (s: Signer) => `${ROLE_LABEL[s.role]} – ${s.name}`;

function log(env: Envelope, event: string) {
  env.events.push({ at: new Date().toISOString(), event });
}

/** Keep the deal record's summary of this envelope current. */
async function syncDeal(storage: Storage, env: Envelope, extra?: (d: DealRecord) => void) {
  const deal = await loadDeal(storage, env.dealKey);
  if (!deal) return;
  deal.signing = deal.signing || {};
  deal.signing[env.kind] = {
    id: env.id,
    status: env.status,
    waitingOn: env.status === "out" ? signerLabel(env.signers[env.current]) : undefined,
    updatedAt: new Date().toISOString(),
  };
  extra?.(deal);
  await saveDeal(storage, deal);
}

// ---------------------------------------------------------------------------
// Create / send
// ---------------------------------------------------------------------------

export interface NewSigner {
  role: Role;
  anchor: number;
  name: string;
  email: string;
}

export async function createEnvelope(
  storage: Storage,
  deal: DealRecord,
  kind: DocKind,
  signersIn: NewSigner[],
  sentBy: { name: string; email: string },
  message: string,
  egnyteToken: string,
): Promise<{ env: Envelope; link: string; emailed: boolean }> {
  const pdfPath = kind === "lease" ? deal.pdfPath : deal.loi?.pdfPath;
  if (!pdfPath) throw new Error(`There is no PDF of the ${kind === "lease" ? "lease draft" : "LOI"} to send. Generate it first.`);
  const existing = deal.signing?.[kind];
  if (existing?.status === "out") throw new Error("This document is already out for signature. Cancel that first.");

  // Order: Tenant first, then Guarantors, then Landlord countersigns last.
  const rank: Record<Role, number> = { tenant: 0, guarantor: 1, landlord: 2 };
  const signers: Signer[] = signersIn
    .map((s) => ({ ...s, name: s.name.trim(), email: s.email.trim().toLowerCase(), status: "waiting" as const }))
    .sort((a, b) => rank[a.role] - rank[b.role] || a.anchor - b.anchor);
  if (!signers.length) throw new Error("Add at least one signer.");
  for (const s of signers) {
    if (!s.name) throw new Error(`${ROLE_LABEL[s.role]} name is missing.`);
    if (emailEnabled() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) throw new Error(`${ROLE_LABEL[s.role]} email is missing or invalid.`);
  }

  const original = await storage.download(pdfPath);
  const anchors = await findAnchors(original);
  for (const s of signers)
    if (!anchors.sig[String(s.anchor)])
      throw new Error(`The ${ROLE_LABEL[s.role].toLowerCase()} signature line (marker \\s${s.anchor}\\) isn't in this PDF. Regenerate the draft from the current template.`);

  const id = newId("E");
  const now = new Date().toISOString();
  const env: Envelope = {
    id,
    dealKey: deal.key,
    kind,
    title: `${kind === "lease" ? "Lease" : "Letter of Intent"} – Unit ${deal.form.suiteNumber} – ${deal.form.tenantLegalName}`,
    suite: deal.form.suiteNumber,
    documentName: pdfPath.split("/").pop()!,
    status: "out",
    signers,
    current: 0,
    originalSha256: await sha256Hex(original),
    originalPages: anchors.pageCount || (await pageCount(original)),
    workingSha256: await sha256Hex(original),
    anchors,
    sentBy,
    sentAt: now,
    message: message.trim(),
    events: [{ at: now, event: `Created by ${sentBy.name}${sentBy.email ? ` (${sentBy.email})` : ""} from ${pdfPath.split("/").pop()}` }],
  };
  await storage.ensureFolder(envDir(id));
  await storage.upload(originalPath(id), original);
  await storage.upload(workingPath(id), original);
  const { link, emailed } = await notifyCurrent(env, egnyteToken);
  await saveEnvelope(storage, env);
  await syncDeal(storage, env, (d) => d.log.push({ at: now, event: `${kind === "lease" ? "Lease" : "LOI"} sent for signature (${env.id})` }));
  return { env, link, emailed };
}

/** Email the current signer their private link (when email is set up). */
export async function notifyCurrent(env: Envelope, egnyteToken: string): Promise<{ link: string; emailed: boolean }> {
  const s = env.signers[env.current];
  const link = await signerLink(env, env.current, egnyteToken);
  s.status = "sent";
  s.sentAt = new Date().toISOString();
  let emailed = false;
  if (emailEnabled() && s.email) {
    await sendMail({
      to: [s.email],
      replyTo: env.sentBy.email || undefined,
      subject: `Please sign: ${env.title}`,
      text:
        `Hello ${s.name},\n\n` +
        `${env.sentBy.name} has sent you the ${env.kind === "lease" ? "lease" : "letter of intent"} for Suite ${env.suite} to review and sign as ${ROLE_LABEL[s.role]}.\n\n` +
        (env.message ? `${env.message}\n\n` : "") +
        `Open your private signing link:\n${link}\n\n` +
        `For your security you'll get a one-time code by email when you open it. The link is personal to you; please don't forward it. It expires in ${LINK_DAYS} days.\n\n` +
        `Questions? Reply to this email to reach ${env.sentBy.name}.`,
    });
    emailed = true;
    log(env, `Signing link emailed to ${signerLabel(s)} (${s.email})`);
  } else {
    log(env, `Signing link created for ${signerLabel(s)} (to be delivered by ${env.sentBy.name})`);
  }
  return { link, emailed };
}

// ---------------------------------------------------------------------------
// Signer side: one-time email code
// ---------------------------------------------------------------------------

export const codeRequired = () => emailEnabled();

export async function sendCode(storage: Storage, env: Envelope, i: number): Promise<string> {
  const s = env.signers[i];
  if (!emailEnabled()) throw new Error("Email codes aren't available.");
  if (s.otp && Date.now() - s.otp.sentAt < 30_000) throw new Error("A code was just sent. Please wait 30 seconds before asking again.");
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  s.otp = { hash: await sha256Hex(`${env.id}:${i}:${code}`), exp: Date.now() + OTP_MINUTES * 60_000, tries: 0, sentAt: Date.now() };
  await sendMail({
    to: [s.email],
    subject: `Your signing code: ${code}`,
    text: `Your one-time code to open "${env.title}" is:\n\n    ${code}\n\nIt expires in ${OTP_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
  });
  log(env, `One-time code emailed to ${s.email}`);
  await saveEnvelope(storage, env);
  return s.email;
}

export async function checkCode(storage: Storage, env: Envelope, i: number, code: string): Promise<boolean> {
  const s = env.signers[i];
  if (!s.otp || Date.now() > s.otp.exp) throw new Error("That code has expired. Please ask for a new one.");
  if (s.otp.tries >= 5) throw new Error("Too many attempts. Please ask for a new code.");
  const ok = (await sha256Hex(`${env.id}:${i}:${code.trim()}`)) === s.otp.hash;
  if (ok) {
    s.otp = undefined;
    s.verifiedAt = new Date().toISOString();
    log(env, `${signerLabel(s)} verified the email code`);
  } else s.otp.tries++;
  await saveEnvelope(storage, env);
  return ok;
}

export async function markViewed(storage: Storage, env: Envelope, i: number, ip: string) {
  const s = env.signers[i];
  if (!s.viewedAt) {
    s.viewedAt = new Date().toISOString();
    log(env, `${signerLabel(s)} opened the document (IP ${ip})`);
    await saveEnvelope(storage, env);
  }
}

// ---------------------------------------------------------------------------
// Signer side: sign
// ---------------------------------------------------------------------------

export interface SignInput {
  method: "typed" | "drawn" | "ink";
  signaturePng?: Uint8Array;
  initials: string;
  uploads: { name: string; data: Buffer }[]; // ink-signed copy and/or notarized pages
  ip: string;
  userAgent: string;
}

export async function applySignature(storage: Storage, env: Envelope, i: number, input: SignInput, egnyteToken: string) {
  const s = env.signers[i];
  if (env.status !== "out" || env.current !== i || s.status === "signed") throw new Error("It isn't your turn to sign, or you've already signed.");
  if (input.method === "ink" && !input.uploads.length) throw new Error("Please upload the signed copy.");
  if (input.method !== "ink" && !input.signaturePng) throw new Error("Please add your signature.");
  const now = new Date();
  const working = await workingPdf(storage, env);

  // Save any uploads first so they're kept even if something later fails.
  s.uploads = s.uploads || [];
  for (const [n, u] of input.uploads.entries()) {
    const p = `${envDir(env.id)}/uploads/${s.role}-${s.anchor}-${n + 1}-${safeName(u.name)}`;
    await storage.upload(p, u.data);
    s.uploads.push(p);
  }

  const stamped = await stampSigner(working, env.anchors, {
    signerIndex: s.anchor,
    role: s.role,
    signaturePng: input.method === "ink" ? undefined : input.signaturePng,
    inkNote: input.method === "ink",
    dateText: longDate(now.toLocaleDateString("en-CA", { timeZone: "America/New_York" })),
    initials: input.method === "ink" ? undefined : input.initials,
    caption: `${input.method === "ink" ? "Signed in ink" : "Electronically signed"} by ${s.name} · ${etTime(now.toISOString())} · ${env.id}`,
  });
  await storage.upload(workingPath(env.id), Buffer.from(stamped));
  env.workingSha256 = await sha256Hex(stamped);

  Object.assign(s, {
    status: "signed",
    signedAt: now.toISOString(),
    consentAt: s.consentAt || now.toISOString(),
    method: input.method,
    initials: input.initials,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  log(env, `${signerLabel(s)} signed (${input.method === "ink" ? "ink-signed copy uploaded" : `electronic, ${input.method}`}; IP ${input.ip})`);
  if (input.uploads.length) log(env, `${signerLabel(s)} uploaded ${input.uploads.map((u) => u.name).join(", ")}`);

  if (env.current < env.signers.length - 1) {
    env.current++;
    await notifyCurrent(env, egnyteToken);
    await saveEnvelope(storage, env);
    await syncDeal(storage, env);
    return { done: false };
  }
  await finalize(storage, env);
  return { done: true };
}

/** Recorded consent to do business electronically (shown before signing). */
export async function recordConsent(storage: Storage, env: Envelope, i: number) {
  const s = env.signers[i];
  if (!s.consentAt) {
    s.consentAt = new Date().toISOString();
    log(env, `${signerLabel(s)} agreed to use electronic records and signatures`);
    await saveEnvelope(storage, env);
  }
}

// ---------------------------------------------------------------------------
// Completion: certificate, seal, file, email everyone
// ---------------------------------------------------------------------------

async function finalize(storage: Storage, env: Envelope) {
  const completedAt = new Date().toISOString();
  env.status = "completed";
  env.completedAt = completedAt;
  log(env, "All parties signed");

  let pdf: Uint8Array = await storage.download(workingPath(env.id));
  const uploads: { name: string; data: Uint8Array }[] = [];
  for (const s of env.signers) for (const p of s.uploads || []) uploads.push({ name: p, data: await storage.download(p) });
  if (uploads.length) pdf = await appendUploads(pdf, uploads);

  const method = (s: Signer) =>
    s.method === "ink" ? "Ink signature (signed copy uploaded and attached)" : `Electronic signature (${s.method})${s.initials && s.role !== "guarantor" ? `; initials "${s.initials}" on each page` : ""}`;
  pdf = await appendCertificate(pdf, {
    title: env.title,
    envelopeId: env.id,
    documentName: env.documentName,
    originalSha256: env.originalSha256,
    originalPages: env.originalPages,
    sentBy: `${env.sentBy.name}${env.sentBy.email ? ` (${env.sentBy.email})` : ""}`,
    sentAt: env.sentAt,
    completedAt,
    signers: env.signers.map((s) => ({
      role: ROLE_LABEL[s.role],
      name: s.name,
      email: s.email,
      method: method(s),
      identity: s.verifiedAt ? `One-time code sent to ${s.email}, verified ${etTime(s.verifiedAt)}` : "Private signing link (no email code)",
      consentAt: s.consentAt,
      signedAt: s.signedAt,
      ip: s.ip,
      userAgent: s.userAgent,
    })),
    events: env.events,
    attachments: env.signers.flatMap((s) => (s.uploads || []).map((p) => `${ROLE_LABEL[s.role]}: ${p.split("/").pop()}`)),
  });
  const sealed = await sealPdf(pdf, `${env.title} – all parties signed`);

  const deal = await loadDeal(storage, env.dealKey);
  const key = env.dealKey;
  let dest: string;
  if (env.kind === "lease") {
    await storage.ensureFolder(folderPath("executed"));
    dest = `${folderPath("executed")}/${key} - EXECUTED.pdf`;
  } else {
    const dir = `${folderPath("pendingDeals")}/${key}`;
    await storage.ensureFolder(dir);
    dest = `${dir}/LOI - ${key} - SIGNED.pdf`;
  }
  if (await storage.exists(dest)) dest = dest.replace(/\.pdf$/, ` (${env.id}).pdf`);
  await storage.upload(dest, sealed);
  env.finalPath = dest;
  env.finalSha256 = await sha256Hex(sealed);
  log(env, `Sealed and filed as ${dest.split("/").pop()}`);

  // Everyone gets the completed copy. Property management gets executed LEASES only.
  const to = [
    ...env.signers.map((s) => s.email),
    env.sentBy.email,
    deal?.createdBy.email,
    deal?.form.tenantBrokerEmail,
    ...(env.kind === "lease" ? config.lease.propertyManagerEmails : []),
  ]
    .filter((e): e is string => !!e && e.includes("@"))
    .map((e) => e.toLowerCase())
    .filter((e, i, a) => a.indexOf(e) === i);

  if (emailEnabled() && to.length) {
    try {
      await sendMail({
        to,
        replyTo: env.sentBy.email || undefined,
        subject: `${env.kind === "lease" ? "Fully Executed Lease" : "Signed Letter of Intent"} – ${key}`,
        text:
          `Hello,\n\nAll parties have signed the ${env.kind === "lease" ? "lease" : "letter of intent"} for ${deal?.form.tenantLegalName ?? key}, Suite ${deal?.form.suiteNumber ?? ""}. ` +
          `The completed copy is attached, with a certificate of completion on the last page.\n\nThank you.`,
        attachments: [{ filename: dest.split("/").pop()!, content: sealed }],
      });
      log(env, `Completed copy emailed to ${to.join(", ")}`);
    } catch (e) {
      log(env, `Email of the completed copy failed: ${(e as Error).message}`);
    }
  }
  await saveEnvelope(storage, env);
  await syncDeal(storage, env, (d) => {
    if (env.kind === "lease") {
      d.status = "executed";
      d.executedPath = dest;
      d.executedAt = completedAt;
      d.log.push({ at: completedAt, event: `Lease fully signed in the app and filed as ${dest.split("/").pop()}` });
    } else if (d.loi) {
      d.loi.signedPath = dest;
      d.loi.signedAt = completedAt;
      d.log.push({ at: completedAt, event: `LOI signed by all parties (${dest.split("/").pop()})` });
    }
  });
}

export async function finalPdf(storage: Storage, env: Envelope): Promise<Buffer | null> {
  return env.finalPath ? storage.download(env.finalPath) : null;
}

export async function voidEnvelope(storage: Storage, env: Envelope, by: string) {
  if (env.status !== "out") throw new Error("Only an envelope that is still out for signature can be cancelled.");
  env.status = "voided";
  env.voidedAt = new Date().toISOString();
  log(env, `Cancelled by ${by}`);
  await saveEnvelope(storage, env);
  await syncDeal(storage, env, (d) => d.log.push({ at: env.voidedAt!, event: `Signing cancelled by ${by} (${env.id})` }));
}

/** Resend the current signer's link (new email; same envelope). */
export async function resend(storage: Storage, env: Envelope, egnyteToken: string) {
  if (env.status !== "out") throw new Error("This envelope is not out for signature.");
  const r = await notifyCurrent(env, egnyteToken);
  await saveEnvelope(storage, env);
  return r;
}

/** Public, signer-safe view of an envelope. */
export function signerView(env: Envelope, i: number) {
  const s = env.signers[i];
  return {
    title: env.title,
    kind: env.kind,
    status: env.status,
    sentBy: env.sentBy.name,
    message: env.message,
    me: { name: s.name, role: s.role, roleLabel: ROLE_LABEL[s.role], status: s.status, emailMasked: maskEmail(s.email), consented: !!s.consentAt },
    myTurn: env.status === "out" && env.current === i,
    waitingOn: env.status === "out" && env.current !== i ? signerLabel(env.signers[env.current]) : null,
    order: env.signers.map((x) => ({ label: signerLabel(x), status: x.status })),
    initialsNeeded: s.role !== "guarantor" && (s.role === "tenant" ? env.anchors.initials.tenant : env.anchors.initials.landlord).length > 0,
    pages: env.originalPages,
  };
}

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  if (!d) return "";
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}
