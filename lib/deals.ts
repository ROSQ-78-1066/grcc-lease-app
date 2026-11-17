import { folderPath, META_FOLDER } from "./config";
import { LeaseForm } from "./lease";
import { Storage } from "./storage/types";

export interface DealRecord {
  key: string; // "Unit 3504 - Acme LLC"
  form: LeaseForm;
  docxPath: string;
  pdfPath: string | null;
  status: "draft" | "executed";
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string; email: string };
  executedPath?: string;
  executedAt?: string;
  sourceSignedFile?: string;
  log: { at: string; event: string }[];
}

const metaDir = () => `${folderPath("drafts")}/${META_FOLDER}`;
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
