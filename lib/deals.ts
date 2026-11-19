import { folderPath, META_FOLDER } from "./config";
import { LeaseForm } from "./lease";
import { Storage } from "./storage/types";

export interface EnvelopeRef {
  id: string;
  status: "out" | "completed" | "voided";
  waitingOn?: string; // e.g. "Tenant – Jane Doe"
  updatedAt: string;
}

export interface DealRecord {
  key: string; // "Unit 3504 - Acme LLC"
  form: LeaseForm;
  /** Lease draft ("" when only an LOI has been made so far). */
  docxPath: string;
  pdfPath: string | null;
  /** App-generated Letter of Intent (saved in Pending Deals/<key>/). */
  loi?: { docxPath: string; pdfPath: string | null; createdAt: string; signedPath?: string; signedAt?: string };
  /** Built-in signing envelopes. */
  signing?: { lease?: EnvelopeRef; loi?: EnvelopeRef };
  status: "draft" | "executed";
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string; email: string };
  executedPath?: string;
  executedAt?: string;
  sourceSignedFile?: string;
  log: { at: string; event: string }[];
}

export const metaDir = () => `${folderPath("drafts")}/${META_FOLDER}`;
const metaPath = (key: string) => `${metaDir()}/${key}.json`;

export async function saveDeal(storage: Storage, rec: DealRecord) {
  await storage.ensureFolder(metaDir());
  rec.updatedAt = new Date().toISOString();
  await storage.upload(metaPath(rec.key), Buffer.from(JSON.stringify(rec, null, 2)));
}

export async function loadDeal(storage: Storage, key: string): Promise<DealRecord | null> {
  try {
    return JSON.parse((await storage.download(metaPath(key))).toString("utf8"));
  } catch {
    return null;
  }
}

export async function listDeals(storage: Storage): Promise<DealRecord[]> {
  let files;
  try {
    files = (await storage.list(metaDir())).files.filter((f) => f.name.endsWith(".json"));
  } catch {
    return [];
  }
  const out: DealRecord[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse((await storage.download(f.path)).toString("utf8")));
    } catch {}
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Delete a deal's lease draft files and its record (Egnyte keeps deleted files in its Trash). */
export async function deleteDeal(storage: Storage, rec: DealRecord): Promise<string[]> {
  const removed: string[] = [];
  // LOI files in Pending Deals are kept: they belong to the deal history.
  for (const p of [rec.docxPath, rec.pdfPath]) {
    if (!p) continue;
    await storage.remove(p);
    removed.push(p.split("/").pop()!);
  }
  await storage.remove(metaPath(rec.key));
  return removed;
}
