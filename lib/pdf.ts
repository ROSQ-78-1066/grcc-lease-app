import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "./config";

const CANDIDATES = [
  "soffice",
  "libreoffice",
  "/usr/bin/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
];

let resolved: string | null | undefined;

function run(bin: string, args: string[], timeout = 90_000): Promise<void> {
  return new Promise((res, rej) =>
    execFile(bin, args, { timeout }, (err) => (err ? rej(err) : res())),
  );
}

async function findSoffice(): Promise<string | null> {
  if (resolved !== undefined) return resolved;
  const list = config.libreOfficePath ? [config.libreOfficePath] : CANDIDATES;
  for (const c of list) {
    try {
      await run(c, ["--version"], 20_000);
      return (resolved = c);
    } catch {}
  }
  return (resolved = null);
}

/** Convert a .docx to PDF with LibreOffice. Returns null when LibreOffice isn't installed. */
export async function docxToPdf(docx: Buffer): Promise<Buffer | null> {
  const bin = await findSoffice();
  if (!bin) return null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lease-"));
  try {
    const input = path.join(dir, "lease.docx");
    await fs.writeFile(input, docx);
    // Separate profile dir so parallel conversions don't collide
    const profile = "file://" + path.join(dir, "profile").replace(/\\/g, "/");
    await run(bin, [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", "pdf", "--outdir", dir, input]);
    return await fs.readFile(path.join(dir, "lease.pdf"));
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
