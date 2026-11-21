import { PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import { config, folderPath, META_FOLDER } from "./config";
import { emailEnabled, sendMail } from "./email";
import { safeName } from "./lease";
import { newId, sealLink } from "./links";
import { ansi, etTime } from "./pdfsign";
import { Storage } from "./storage/types";

// ---------------------------------------------------------------------------
// Upload rules for tenant applications (PDF, Word, images only)
// ---------------------------------------------------------------------------
export const UPLOAD_LIMITS = {
  maxFiles: 10,
  maxFileMb: 15,
  maxTotalMb: 50,
  maxSubmissions: 5,
  /** Open (reusable) links: most submissions accepted from one internet address per day. */
  openPerIpPerDay: 3,
  accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif",
};

/** Checks the file's first bytes, not just its name. */
export function fileKind(name: string, data: Uint8Array): "pdf" | "doc" | "docx" | "jpg" | "png" | "heic" | null {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const b = data;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (ext === "pdf" && starts(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (ext === "docx" && starts(0x50, 0x4b, 0x03, 0x04)) return "docx";
  if (ext === "doc" && starts(0xd0, 0xcf, 0x11, 0xe0)) return "doc";
  if ((ext === "jpg" || ext === "jpeg") && starts(0xff, 0xd8, 0xff)) return "jpg";
  if (ext === "png" && starts(0x89, 0x50, 0x4e, 0x47)) return "png";
  if ((ext === "heic" || ext === "heif") && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "heic";
  return null;
}

// ---------------------------------------------------------------------------
// Link records
// ---------------------------------------------------------------------------
export interface Submission {
  at: string;
  folder: string;
  files: string[];
  businessName: string;
  ip: string;
  values: Record<string, string>;
  signedName: string;
}
export interface AppLink {
  id: string;
  createdAt: string;
  createdBy: { name: string; email: string };
  suite: string;
  streetNumber: string;
  prospect: string;
  prospectEmail: string;
  /** "" = never expires (open links only). */
  expiresAt: string;
  /** Reusable link a broker can forward to any prospect: no submission cap, optional expiry. */
  open?: boolean;
  /** Extra people alerted on every submission (e.g. the leasing broker). */
  notify?: string[];
  status: "active" | "revoked";
  submissions: Submission[];
}

const dir = () => `${folderPath("pendingDeals")}/${META_FOLDER}/application-links`;
const recPath = (id: string) => `${dir()}/${id}.json`;

export async function saveLink(storage: Storage, rec: AppLink) {
  await storage.ensureFolder(dir());
  await storage.upload(recPath(rec.id), Buffer.from(JSON.stringify(rec, null, 2)));
}

export async function loadLink(storage: Storage, id: string): Promise<AppLink | null> {
  if (!/^A[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    return JSON.parse((await storage.download(recPath(id))).toString("utf8"));
  } catch {
    return null;
  }
}

export async function listLinks(storage: Storage): Promise<AppLink[]> {
  let files;
  try {
    files = (await storage.list(dir())).files.filter((f) => f.name.endsWith(".json"));
  } catch {
    return [];
  }
  const out: AppLink[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse((await storage.download(f.path)).toString("utf8")));
    } catch {}
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createLink(
  storage: Storage,
  input: { suite: string; streetNumber: string; prospect: string; prospectEmail: string; days: number; open?: boolean; notify?: string[] },
  createdBy: { name: string; email: string },
  egnyteToken: string,
) {
  const open = !!input.open;
  // Open links may run with no expiry (days = 0) or up to a year; private links 1-60 days.
  const days = open ? Math.min(Math.max(Math.round(input.days || 0), 0), 365) : Math.min(Math.max(Math.round(input.days || 14), 1), 60);
  const rec: AppLink = {
    id: newId("A"),
    createdAt: new Date().toISOString(),
    createdBy,
    suite: input.suite.trim(),
    streetNumber: input.streetNumber.trim(),
    prospect: input.prospect.trim(),
    prospectEmail: input.prospectEmail.trim(),
    expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : "",
    open,
    notify: (input.notify || []).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
    status: "active",
    submissions: [],
  };
  await saveLink(storage, rec);
  const url = await linkUrl(rec, egnyteToken, days);
  let emailed = false;
  if (rec.prospectEmail && emailEnabled()) {
    const until = rec.expiresAt
      ? `It works until ${new Date(rec.expiresAt).toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "long" })}. `
      : "";
    await sendMail({
      to: [rec.prospectEmail],
      replyTo: createdBy.email || undefined,
      ...(rec.open
        ? {
            subject: "Your reusable tenant application link – Roger B. Chaffee Memorial Blvd. SE",
            text:
              `Hello${rec.prospect ? ` ${rec.prospect}` : ""},\n\n` +
              `Here is the online tenant application link for the Roger B. Chaffee Memorial Blvd. SE buildings. You can forward it to any prospective tenant, ` +
              `as many times as you like:\n\n${url}\n\n` +
              `Each prospect fills in the form and uploads their documents (PDF, Word or photos). Everything is filed automatically, and you'll get an email for every submission. ` +
              `${until}\n\n${createdBy.name}`,
          }
        : {
            subject: `Tenant application${rec.suite ? ` – Suite ${rec.suite}` : ""}, Roger B. Chaffee Memorial Blvd. SE`,
            text:
              `Hello${rec.prospect ? ` ${rec.prospect}` : ""},\n\n` +
              `Thank you for your interest${rec.suite ? ` in Suite ${rec.suite}` : ""}. Please complete our tenant application and upload any supporting documents here:\n\n${url}\n\n` +
              `This private link expires on ${new Date(rec.expiresAt).toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "long" })}. ` +
              `You can upload PDF, Word and image files.\n\nQuestions? Reply to this email.\n\n${createdBy.name}`,
          }),
    });
    emailed = true;
  }
  return { rec, url, emailed };
}

export async function linkUrl(rec: AppLink, egnyteToken: string, days?: number) {
  // A link with no expiry still carries a (10-year) token lifetime.
  const left = !rec.expiresAt ? 3650 : days || Math.max(1, Math.ceil((new Date(rec.expiresAt).getTime() - Date.now()) / 86_400_000));
  return `${config.appUrl}/apply/${await sealLink({ k: "apply", id: rec.id, t: egnyteToken }, left)}`;
}

export function linkOpen(rec: AppLink, ip?: string): string | null {
  if (rec.status === "revoked") return "This application link has been turned off. Please contact the leasing broker.";
  if (rec.expiresAt && Date.now() > new Date(rec.expiresAt).getTime()) return "This application link has expired. Please contact the leasing broker for a new one.";
  if (!rec.open && rec.submissions.length >= UPLOAD_LIMITS.maxSubmissions) return "This link has reached its limit of submissions. Please contact the leasing broker.";
  if (rec.open && ip) {
    const today = rec.submissions.filter((s) => s.ip === ip && Date.now() - new Date(s.at).getTime() < 86_400_000).length;
    if (today >= UPLOAD_LIMITS.openPerIpPerDay) return "We've received several applications from this connection today. Please try again tomorrow or contact the leasing broker.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// The application form
// ---------------------------------------------------------------------------
export const APP_FIELDS: { section: string; fields: { key: string; label: string; required?: boolean; type?: "text" | "email" | "tel" | "date" | "number" | "textarea" | "select" | "yesno"; options?: string[]; hint?: string }[] }[] = [
  {
    section: "Business",
    fields: [
      { key: "businessName", label: "Legal name of business (or your full name if an individual)", required: true },
      { key: "dba", label: "Doing business as (if different)" },
      { key: "entityType", label: "Type of entity", required: true, type: "select", options: ["LLC", "Corporation", "Partnership", "Sole proprietor / individual", "Other"] },
      { key: "stateOfFormation", label: "State where formed" },
      { key: "yearsInBusiness", label: "Years in business", type: "number" },
      { key: "businessType", label: "Type of business / how you will use the space", required: true, type: "textarea" },
      { key: "employees", label: "Number of employees at this location", type: "number" },
      { key: "website", label: "Website" },
    ],
  },
  {
    section: "Contact and signer",
    fields: [
      { key: "contactName", label: "Name of person who will sign the lease", required: true },
      { key: "contactTitle", label: "Title", required: true },
      { key: "email", label: "Email", required: true, type: "email" },
      { key: "phone", label: "Phone", required: true, type: "tel" },
      { key: "noticeAddress", label: "Mailing address for notices", required: true, type: "textarea" },
    ],
  },
  {
    section: "Space and timing",
    fields: [
      { key: "suite", label: "Suite you are applying for" },
      { key: "moveIn", label: "Desired move-in date", type: "date" },
      { key: "termMonths", label: "Desired lease term (months)", type: "number" },
      { key: "vehicles", label: "Trucks, trailers or vehicles to be parked or loaded", type: "textarea" },
      { key: "hazmat", label: "Will you store or use any hazardous materials?", type: "yesno" },
      { key: "hazmatDetail", label: "If yes, describe", type: "textarea" },
    ],
  },
  {
    section: "References and guarantors",
    fields: [
      { key: "currentLandlord", label: "Current landlord (name and phone)" },
      { key: "bankReference", label: "Bank (name, contact and phone)" },
      { key: "guarantors", label: "Proposed personal guarantor(s): names and home addresses", type: "textarea" },
    ],
  },
];

export const CERTIFY_TEXT =
  "I certify that the information in this application is true and complete. I authorize Landlord and its agents to verify it, " +
  "including by contacting the references listed and obtaining business credit reports. I understand that this application " +
  "does not create a lease, and that no lease exists until one is signed by both Landlord and Tenant.";

/** Readable PDF of the answers, saved next to the uploads (and readable by the app's AI extraction). */
export async function applicationPdf(values: Record<string, string>, meta: { suite: string; submittedAt: string; ip: string; signedName: string; files: string[] }) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const wrap = (t: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of ansi(t).split("\n")) {
      let line = "";
      for (const w of para.split(" ")) {
        const c = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(c, size) > width && line) {
          out.push(line);
          line = w;
        } else line = c;
      }
      out.push(line);
    }
    return out;
  };
  const write = (t: string, size = 10, font = helv, x = M, width = W - 2 * M) => {
    for (const l of wrap(t, font, size, width)) {
      if (y < M + size) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      page.drawText(l, { x, y: y - size, size, font, color: rgb(0.1, 0.1, 0.12) });
      y -= size + 4;
    }
  };
  write("Tenant Application", 18, bold);
  write(`Bluewater Corporate Center, LLC · Roger B. Chaffee Memorial Blvd. SE, Wyoming, MI${meta.suite ? ` · Suite ${meta.suite}` : ""}`, 9);
  write(`Submitted ${etTime(meta.submittedAt)} from IP ${meta.ip}`, 9);
  y -= 8;
  for (const s of APP_FIELDS) {
    if (!s.fields.some((f) => (values[f.key] || "").trim())) continue;
    y -= 4;
    write(s.section.toUpperCase(), 10, bold);
    for (const f of s.fields) {
      const v = (values[f.key] || "").trim();
      if (!v) continue;
      const before = y;
      write(f.label, 9, bold, M, 200);
      const after = y;
      y = before;
      write(v, 10, helv, M + 210, W - 2 * M - 210);
      y = Math.min(y, after) - 2;
    }
  }
  y -= 8;
  write("CERTIFICATION", 10, bold);
  write(CERTIFY_TEXT, 9);
  write(`Agreed and signed electronically by: ${meta.signedName}`, 10, bold);
  if (meta.files.length) {
    y -= 6;
    write("UPLOADED FILES", 10, bold);
    for (const f of meta.files) write(`• ${f}`, 9);
  }
  return Buffer.from(await doc.save());
}

export async function submitApplication(
  storage: Storage,
  rec: AppLink,
  values: Record<string, string>,
  signedName: string,
  files: { name: string; data: Buffer }[],
  ip: string,
) {
  const now = new Date();
  const business = safeName(values.businessName || rec.prospect || "Applicant").slice(0, 80);
  const suite = (values.suite || rec.suite || "").replace(/[^\w-]/g, "");
  const folder = `${folderPath("pendingDeals")}/${suite ? `Unit ${suite} - ${business}` : `Prospect - ${business}`}`;
  await storage.ensureFolder(folder);
  const stamp = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const saved: string[] = [];
  for (const f of files) {
    let name = safeName(f.name).slice(-120);
    if (await storage.exists(`${folder}/${name}`)) name = name.replace(/(\.[^.]+)?$/, ` (${stamp} ${now.getTime() % 100000})$1`);
    await storage.upload(`${folder}/${name}`, f.data);
    saved.push(name);
  }
  const pdfName = `Tenant Application - ${business} - ${stamp}.pdf`;
  await storage.upload(`${folder}/${pdfName}`, await applicationPdf(values, { suite, submittedAt: now.toISOString(), ip, signedName, files: saved }));

  rec.submissions.push({ at: now.toISOString(), folder, files: [pdfName, ...saved], businessName: values.businessName || "", ip, values, signedName });
  await saveLink(storage, rec);

  // Alert the broker on every submission.
  const to = [rec.createdBy.email, ...config.lease.applicationAlertEmails, ...(rec.notify || [])]
    .map((e) => (e || "").toLowerCase())
    .filter((e, i, a) => e && a.indexOf(e) === i);
  if (emailEnabled() && to.length) {
    const folderLink = await storage.webLink(folder).catch(() => null);
    await sendMail({
      to,
      replyTo: values.email || undefined,
      subject: `New tenant application: ${values.businessName || rec.prospect}${suite ? ` – Suite ${suite}` : ""}`,
      text:
        `A tenant application was just submitted.\n\n` +
        `Business: ${values.businessName}\nContact: ${values.contactName} (${values.contactTitle})\nEmail: ${values.email}\nPhone: ${values.phone}\n` +
        `Suite: ${suite || "not specified"}\nUse: ${values.businessType}\nFiles: ${[pdfName, ...saved].join(", ")}\n\n` +
        `Saved in Egnyte: ${folder}${folderLink ? `\n${folderLink}` : ""}\n\nYou can pick these files in the app's New Lease wizard (Step 2) to pre-fill the lease.`,
    }).catch((e) => console.error("[apply] alert email failed:", (e as Error).message));
  }
  return { folder, files: [pdfName, ...saved] };
}
