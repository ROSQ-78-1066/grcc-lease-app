import fs from "node:fs/promises";
import nodePath from "node:path";
import { folderPath, rootPath } from "./config";
import { DealRecord, loadDeal, saveDeal } from "./deals";
import { addDays, dealKey, LeaseForm, longDate, mergeData, TEMPLATE_LABEL } from "./lease";
import { mergeDocx } from "./merge";
import { docxToPdf } from "./pdf";
import { Storage } from "./storage/types";

/** Egnyte copy (editable by the Landlord) wins over the copy bundled with the app. */
export const LOI_TEMPLATE_EGNYTE = "TEMPLATES/Tagged/LOI_Template.docx";
const LOI_DAYS_TO_ACCEPT = 10;

export function loiData(f: LeaseForm) {
  return {
    ...mergeData(f),
    LOADING_TEXT: f.template === "A" ? "dock-high shipping doors" : "overhead (drive-in) doors",
    LEASE_FORM: `Lease ${TEMPLATE_LABEL[f.template].code} – ${TEMPLATE_LABEL[f.template].name}`,
    LOI_EXPIRES: longDate(addDays(f.effectiveDate, LOI_DAYS_TO_ACCEPT)),
  };
}

async function loiTemplate(storage: Storage): Promise<Buffer> {
  try {
    return await storage.download(rootPath(LOI_TEMPLATE_EGNYTE));
  } catch {
    return fs.readFile(nodePath.join(process.cwd(), "templates", "LOI_Template.docx"));
  }
}

export async function generateLoi(storage: Storage, f: LeaseForm, createdBy: { name: string; email: string }) {
  const key = dealKey(f);
  const dir = `${folderPath("pendingDeals")}/${key}`;
  await storage.ensureFolder(dir);
  const docx = mergeDocx(await loiTemplate(storage), loiData(f));
  const docxPath = `${dir}/LOI - ${key}.docx`;
  const pdfPath = `${dir}/LOI - ${key}.pdf`;
  const docxEntry = await storage.upload(docxPath, docx);
  const pdf = await docxToPdf(docx);
  const pdfEntry = pdf ? await storage.upload(pdfPath, pdf) : null;

  const now = new Date().toISOString();
  const prev = await loadDeal(storage, key);
  if (prev?.signing?.loi?.status === "out") throw new Error("The LOI is out for signature. Cancel that first to make a new one.");
  const rec: DealRecord = prev ?? {
    key,
    form: f,
    docxPath: "",
    pdfPath: null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdBy,
    log: [],
  };
  rec.form = f;
  rec.loi = { docxPath, pdfPath: pdfEntry ? pdfPath : null, createdAt: now };
  if (rec.signing?.loi) delete rec.signing.loi;
  rec.log.push({ at: now, event: prev?.loi ? "LOI regenerated" : "LOI created" });
  await saveDeal(storage, rec);

  return {
    key,
    docxPath,
    pdfPath: rec.loi.pdfPath,
    docxLink: await storage.webLink(docxPath, docxEntry),
    pdfLink: pdfEntry ? await storage.webLink(pdfPath, pdfEntry) : null,
    folderLink: await storage.webLink(dir),
    warnings: pdf ? [] : ["LibreOffice is not installed here, so no PDF was made. (The Render build includes it.)"],
  };
}
