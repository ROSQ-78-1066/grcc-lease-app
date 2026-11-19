import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import forge from "node-forge";
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import signpdf from "@signpdf/signpdf";
import { config } from "./config";

// ---------------------------------------------------------------------------
// Anchor positions. The lease templates carry white (invisible) markers in the signature
// block — \s1\ \d1\ (Tenant), \s2\ \d2\ (Landlord), \s3\ \d3\ \s4\ \d4\ (Guarantors) — and
// every page footer reads "INITIALS: LANDLORD: ___ TENANT: ___". pdftotext (poppler-utils)
// gives the position of every word, so we read them once from the PDF that was sent.
// ---------------------------------------------------------------------------

export interface Box {
  page: number; // 0-based
  x: number; // left, PDF points
  y: number; // baseline (bottom of the word box), measured from the BOTTOM of the page
  h: number; // word box height
}
export interface AnchorMap {
  sig: Record<string, Box>; // "1".."4"
  date: Record<string, Box>;
  initials: { landlord: Box[]; tenant: Box[] };
  pageCount: number;
}

function run(bin: string, args: string[], timeout = 60_000): Promise<void> {
  return new Promise((res, rej) => execFile(bin, args, { timeout }, (err) => (err ? rej(err) : res())));
}

export async function findAnchors(pdf: Uint8Array): Promise<AnchorMap> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anchors-"));
  try {
    const input = path.join(dir, "in.pdf");
    const out = path.join(dir, "out.html");
    await fs.writeFile(input, pdf);
    try {
      await run("pdftotext", ["-bbox", input, out]);
    } catch {
      throw new Error("pdftotext (poppler-utils) is not installed on the server, so signature positions can't be found.");
    }
    return parseBbox(await fs.readFile(out, "utf8"));
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function parseBbox(html: string): AnchorMap {
  const map: AnchorMap = { sig: {}, date: {}, initials: { landlord: [], tenant: [] }, pageCount: 0 };
  const pages = html.split(/<page /).slice(1);
  map.pageCount = pages.length;
  pages.forEach((pg, pi) => {
    const H = Number(/height="([\d.]+)"/.exec(pg)?.[1] || 792);
    const words = [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
      (m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: decode(m[5]) }),
    );
    const box = (w: (typeof words)[number], dx = 0): Box => ({ page: pi, x: w.x0 + dx, y: H - w.y1, h: w.y1 - w.y0 });
    for (const w of words) {
      const m = /^\\([sd])([1-4])\\/.exec(w.t);
      if (m) (m[1] === "s" ? map.sig : map.date)[m[2]] = box(w);
    }
    // Footer: INITIALS: LANDLORD: ____ TENANT: ____
    for (const w of words.filter((w) => w.t === "INITIALS:")) {
      const line = words.filter((o) => Math.abs(o.y1 - w.y1) < 2 && o.x0 > w.x0);
      const ll = line.find((o) => o.t === "LANDLORD:");
      const tt = line.find((o) => o.t === "TENANT:");
      if (ll) map.initials.landlord.push({ page: pi, x: ll.x1 + 3, y: H - ll.y1, h: ll.y1 - ll.y0 });
      if (tt) map.initials.tenant.push({ page: pi, x: tt.x1 + 3, y: H - tt.y1, h: tt.y1 - tt.y0 });
    }
  });
  return map;
}

// ---------------------------------------------------------------------------
// Stamping
// ---------------------------------------------------------------------------

/** pdf-lib's standard fonts only encode WinAnsi; replace anything else. */
export function ansi(s: string): string {
  return (s || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

export interface StampInput {
  signerIndex: number; // 1..4 (anchor number)
  role: "tenant" | "landlord" | "guarantor";
  signaturePng?: Uint8Array; // electronic signature image
  inkNote?: boolean; // signed in ink: write a note instead of an image
  dateText: string;
  initials?: string; // stamped on every page footer (tenant / landlord only)
  caption: string; // tiny line under the signature (name + envelope id)
}

export async function stampSigner(pdfBytes: Uint8Array, anchors: AnchorMap, s: StampInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const key = String(s.signerIndex);
  const sig = anchors.sig[key];
  if (!sig) throw new Error(`Signature marker \\s${key}\\ was not found in the document.`);
  const page = pages[sig.page];

  if (s.signaturePng) {
    const img = await doc.embedPng(s.signaturePng);
    const maxW = 150, maxH = 30;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: sig.x + 4, y: sig.y + 2, width: w, height: h });
  } else if (s.inkNote) {
    page.drawText("Signed in ink - see attached signed copy", { x: sig.x + 4, y: sig.y + 6, size: 8, font: ital, color: rgb(0.1, 0.1, 0.4) });
  }
  page.drawText(ansi(s.caption), { x: sig.x + 4, y: sig.y - 5, size: 5, font: helv, color: rgb(0.35, 0.35, 0.45) });

  const date = anchors.date[key];
  if (date) pages[date.page].drawText(ansi(s.dateText), { x: date.x + 4, y: date.y + 4, size: 10, font: helv, color: rgb(0.05, 0.05, 0.3) });

  if (s.initials && (s.role === "tenant" || s.role === "landlord")) {
    for (const b of anchors.initials[s.role]) {
      pages[b.page].drawText(ansi(s.initials), { x: b.x + 2, y: b.y + 2, size: 8, font: ital, color: rgb(0.05, 0.05, 0.4) });
    }
  }
  return doc.save();
}

/** Append scanned / uploaded pages (PDF, JPG, PNG) to the document. */
export async function appendUploads(pdfBytes: Uint8Array, uploads: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  for (const u of uploads) {
    const ext = u.name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") {
      const src = await PDFDocument.load(u.data, { ignoreEncryption: true });
      for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p);
    } else if (ext === "jpg" || ext === "jpeg" || ext === "png") {
      const img = ext === "png" ? await doc.embedPng(u.data) : await doc.embedJpg(u.data);
      const page = doc.addPage([612, 792]);
      const scale = Math.min(552 / img.width, 732 / img.height, 1);
      page.drawImage(img, { x: (612 - img.width * scale) / 2, y: (792 - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
    }
  }
  return doc.save();
}

// ---------------------------------------------------------------------------
// Certificate of completion
// ---------------------------------------------------------------------------

export interface CertSigner {
  role: string;
  name: string;
  email: string;
  method: string;
  identity: string;
  consentAt?: string;
  signedAt?: string;
  ip?: string;
  userAgent?: string;
}
export interface CertInput {
  title: string;
  envelopeId: string;
  documentName: string;
  originalSha256: string;
  originalPages: number;
  sentBy: string;
  sentAt: string;
  completedAt: string;
  signers: CertSigner[];
  events: { at: string; event: string }[];
  attachments: string[];
}

export const etTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "medium" }) + " ET"
    : "-";

export async function appendCertificate(pdfBytes: Uint8Array, c: CertInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of ansi(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) > width && line) {
          out.push(line);
          line = word;
        } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const text = (t: string, o: { size?: number; font?: PDFFont; x?: number; width?: number; color?: [number, number, number]; gap?: number } = {}) => {
    const size = o.size ?? 9, font = o.font ?? helv, x = o.x ?? M, width = o.width ?? W - M - x;
    for (const line of wrap(t, font, size, width)) {
      if (y < M + size) newPage();
      page.drawText(line, { x, y: y - size, size, font, color: rgb(...(o.color ?? [0.1, 0.1, 0.12])) });
      y -= size + 3;
    }
    y -= o.gap ?? 0;
  };
  const row = (label: string, value: string) => {
    const before = y;
    text(label, { font: bold, size: 8.5, width: 130 });
    const after = y;
    y = before;
    text(value, { x: M + 140, size: 8.5 });
    y = Math.min(y, after);
  };
  const rule = () => {
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.78) });
    y -= 10;
  };

  text("Certificate of Completion", { size: 18, font: bold, gap: 2 });
  text(c.title, { size: 11, gap: 8, color: [0.3, 0.3, 0.35] });
  rule();
  row("Envelope ID", c.envelopeId);
  row("Document", c.documentName);
  row("Original pages", String(c.originalPages));
  row("Original SHA-256", c.originalSha256);
  row("Sent by", c.sentBy);
  row("Sent", etTime(c.sentAt));
  row("Completed", etTime(c.completedAt));
  if (c.attachments.length) row("Attached copies", c.attachments.join("; "));
  y -= 6;

  for (const s of c.signers) {
    rule();
    text(`${s.role}: ${s.name}`, { size: 11, font: bold, gap: 2 });
    row("Email", s.email || "-");
    row("Signature", s.method);
    row("Identity check", s.identity);
    row("Consent to e-sign", etTime(s.consentAt));
    row("Signed", etTime(s.signedAt));
    row("IP address", s.ip || "-");
    row("Browser", (s.userAgent || "-").slice(0, 160));
    y -= 4;
  }
  rule();
  text("Event history", { size: 11, font: bold, gap: 2 });
  for (const e of c.events) text(`${etTime(e.at)}   ${e.event}`, { size: 8 });
  y -= 8;
  rule();
  text(
    "Each signer agreed to use electronic records and signatures before signing. These signatures are made under the federal " +
      "Electronic Signatures in Global and National Commerce Act (15 U.S.C. 7001 et seq.) and the Michigan Uniform Electronic " +
      "Transactions Act (MCL 450.831 et seq.). This PDF is sealed with a digital signature when completed: if any page is " +
      "changed afterward, PDF readers such as Adobe Acrobat will show the signature as invalid.",
    { size: 8, color: [0.3, 0.3, 0.35] },
  );
  return doc.save();
}

// ---------------------------------------------------------------------------
// Tamper seal: a PKCS#7 digital signature over the whole finished PDF.
// The certificate is self-issued (from SESSION_SECRET, or SIGNING_P12_BASE64 if provided): readers show
// the signer as "unknown" but will flag any change made after sealing.
// ---------------------------------------------------------------------------

let p12Cache: Buffer | null = null;

function sealCertificate(): { p12: Buffer; pass: string } {
  const b64 = (process.env.SIGNING_P12_BASE64 || "").trim();
  if (b64) return { p12: Buffer.from(b64, "base64"), pass: process.env.SIGNING_P12_PASSWORD || "" };
  if (p12Cache) return { p12: p12Cache, pass: "" };
  // Deterministic key from SESSION_SECRET, so every seal uses the same certificate without storing one.
  const md = forge.md.sha256.create();
  md.update(`seal:v1:${config.sessionSecret}`);
  const prng = forge.random.createInstance();
  prng.seedFileSync = () => md.digest().getBytes();
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, prng, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.UTC(2026, 0, 1));
  cert.validity.notAfter = new Date(Date.UTC(2046, 0, 1));
  const attrs = [
    { name: "commonName", value: "GRCC Lease App Document Seal" },
    { name: "organizationName", value: "Bluewater Corporate Center, LLC" },
    { shortName: "ST", value: "Michigan" },
    { name: "countryName", value: "US" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "", { algorithm: "3des" });
  p12Cache = Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
  return { p12: p12Cache, pass: "" };
}

export async function sealPdf(pdfBytes: Uint8Array, reason: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason,
    contactInfo: "",
    name: "GRCC Lease App Document Seal",
    location: "Michigan, USA",
    signatureLength: 8192,
  });
  const withPlaceholder = Buffer.from(await doc.save({ useObjectStreams: false }));
  const { p12, pass } = sealCertificate();
  return signpdf.sign(withPlaceholder, new P12Signer(p12, { passphrase: pass }));
}

export async function pageCount(pdfBytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdfBytes, { ignoreEncryption: true })).getPageCount();
}
