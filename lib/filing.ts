import { config, folderPath } from "./config";
import { DealRecord, listDeals, saveDeal } from "./deals";
import { emailEnabled, sendMail } from "./email";
import { safeName } from "./lease";
import { FileEntry, Storage } from "./storage/types";

export interface FilingResult {
  filed: { deal: string; from: string; to: string; emailed: string[] }[];
  skipped: { file: string; reason: string }[];
  errors: string[];
}

const strip = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();

/** "Unit 12 - Acme LLC - Draft (Signed).pdf" -> "Unit 12 - Acme LLC" */
export function cleanBaseName(name: string): string {
  const marker = new RegExp(`[\\s_()\\[\\]-]*(?<![A-Za-z])(${config.executedPattern})(?![A-Za-z])[\\s_()\\[\\]-]*`, "ig");
  return safeName(
    name
      .replace(/\.pdf$/i, "")
      .replace(marker, " ")
      .replace(/[\s_-]*(?<![A-Za-z])draft(?![A-Za-z])[\s_-]*/gi, " ")
      .replace(/[\s_()\[\]-]+$/, ""),
  );
}

/** Is this file the signed copy that DocuSign returned into /Draft Leases? */
export function looksSigned(name: string): boolean {
  if (!/\.pdf$/i.test(name)) return false;
  if (/ - draft\.pdf$/i.test(name)) return false;
  return new RegExp(config.executedPattern, "i").test(name);
}

function matchDeal(file: FileEntry, deals: DealRecord[]): DealRecord | null {
  const n = strip(file.name);
  // Longest key that the file name starts with (or contains)
  const hits = deals.filter((d) => n.startsWith(strip(d.key)) || n.includes(strip(d.key)));
  return hits.sort((a, b) => b.key.length - a.key.length)[0] || null;
}

/**
 * Scan /Draft Leases for signed PDFs, copy each to
 * /Executed New Leases/Unit [SUITE] - [TENANT] - EXECUTED.pdf and email all parties.
 * Pass `onlyPath` to process a single file (webhook).
 */
export async function fileExecutedLeases(storage: Storage, onlyPath?: string): Promise<FilingResult> {
  const result: FilingResult = { filed: [], skipped: [], errors: [] };
  const draftsDir = folderPath("drafts");
  const execDir = folderPath("executed");
  const deals = await listDeals(storage);

  let files = (await storage.list(draftsDir)).files;
  if (onlyPath) files = files.filter((f) => f.path.toLowerCase() === onlyPath.toLowerCase());

  for (const f of files) {
    if (!looksSigned(f.name)) continue;
    const deal = matchDeal(f, deals);
    const base = deal
      ? deal.key
      : cleanBaseName(f.name);
    const dest = `${execDir}/${base} - EXECUTED.pdf`;
    try {
      if (await storage.exists(dest)) {
        result.skipped.push({ file: f.name, reason: "Already filed" });
        continue;
      }
      await storage.ensureFolder(execDir);
      await storage.copy(f.path, dest);
      const emailed: string[] = [];
      if (deal) {
        deal.status = "executed";
        deal.executedPath = dest;
        deal.executedAt = new Date().toISOString();
        deal.sourceSignedFile = f.path;
        deal.log.push({ at: deal.executedAt, event: `Executed copy filed from ${f.name}` });
        if (emailEnabled()) {
          const to = [config.lease.landlordEmail, deal.form.tenantEmail, deal.form.tenantBrokerEmail, deal.createdBy.email].filter(
            (e, i, a) => e && a.indexOf(e) === i,
          );
          try {
            await sendMail({
              to,
              subject: `Fully Executed Lease – ${deal.key}`,
              text: `Hello,\n\nAttached is the fully executed lease for ${deal.form.tenantLegalName}, Suite ${deal.form.suiteNumber}.\n\nThank you.`,
              attachments: [{ filename: `${base} - EXECUTED.pdf`, content: await storage.download(dest) }],
            });
            emailed.push(...to);
            deal.log.push({ at: new Date().toISOString(), event: `Executed copy emailed to ${to.join(", ")}` });
          } catch (e) {
            result.errors.push(`Filed ${f.name} but email failed: ${(e as Error).message}`);
          }
        }
        await saveDeal(storage, deal);
      }
      result.filed.push({ deal: base, from: f.path, to: dest, emailed });
    } catch (e) {
      result.errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  return result;
}
