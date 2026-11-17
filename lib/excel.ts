import ExcelJS from "exceljs";
import { config, folderPath } from "./config";
import { proportionateShare, Suite, TemplateKey } from "./lease";
import { Storage } from "./storage/types";

export interface ColumnMapping {
  sheet?: string; // default: first sheet
  suite: string;
  tenant: string;
  sqft: string;
  loadingType: string;
  streetNumber?: string; // optional; derived from the suite number when blank
  share?: string; // optional; always recalculated from sq ft
  comments?: string;
}

export const MAPPING_FILE = "_column-mapping.json";

const GUESS: Record<keyof Omit<ColumnMapping, "sheet">, RegExp> = {
  suite: /^(unit|suite)/i,
  tenant: /tenant/i,
  sqft: /^(area|rentable|sq\.? ?ft|square)/i,
  loadingType: /(lease a or b|lease ab|lease cd|ab or cd|cd or ab|loading|dock|door|template|type)/i,
  streetNumber: /(street|address)/i,
  share: /(ttl|share|propor|%)/i,
  comments: /(comment|note)/i,
};

type Cell = string | number | null;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    // Formula cells: use the evaluated (cached) result
    if ("result" in v) return cellValue((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("error" in v) return null;
  }
  return String(v);
}

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

export interface WorkbookInfo {
  fileName: string;
  path: string;
  sheets: string[];
  headers: string[];
  headerRow: number;
  mapping: ColumnMapping;
  mappingSaved: boolean;
  suites: Suite[];
  warnings: string[];
}

export async function findWorkbook(storage: Storage): Promise<{ name: string; path: string }> {
  const cfg = folderPath("config");
  const list = await storage.list(cfg);
  const xlsx = list.files.filter((f) => /\.xlsx$/i.test(f.name) && !f.name.startsWith("~$"));
  const pick = config.configWorkbook ? xlsx.find((f) => f.name === config.configWorkbook) : xlsx[0];
  if (!pick) throw new Error(`No .xlsx workbook found in ${cfg}. Upload your master suite list there.`);
  return { name: pick.name, path: pick.path };
}

export async function loadMapping(storage: Storage): Promise<ColumnMapping | null> {
  const p = `${folderPath("config")}/${MAPPING_FILE}`;
  try {
    return JSON.parse((await storage.download(p)).toString("utf8"));
  } catch {
    return null;
  }
}

export async function saveMapping(storage: Storage, m: ColumnMapping) {
  await storage.upload(`${folderPath("config")}/${MAPPING_FILE}`, Buffer.from(JSON.stringify(m, null, 2)));
}

function loadingFromValue(raw: string): TemplateKey | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  // New labels: "CD" = dock suites (Buildings C & D), "AB" = overhead doors (Buildings A & B).
  if (/^(lease\s*)?cd$/.test(v)) return "A";
  if (/^(lease\s*)?ab$/.test(v)) return "B";
  // Old labels, still accepted.
  if (v === "a" || /ship|dock/.test(v)) return "A";
  if (v === "b" || /overhead|door/.test(v)) return "B";
  return null;
}

/** First number in a unit label, e.g. "3506, 3508A" -> "3506". */
function streetFromSuite(suite: string): string {
  return /\d+/.exec(suite)?.[0] ?? "";
}

export async function readSuites(storage: Storage, override?: ColumnMapping): Promise<WorkbookInfo> {
  const wbFile = await findWorkbook(storage);
  const buf = await storage.download(wbFile.path);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheets = wb.worksheets.map((w) => w.name);
  const saved = override ?? (await loadMapping(storage));
  const ws = (saved?.sheet && wb.getWorksheet(saved.sheet)) || wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets.");

  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const vals: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (c, col) => (vals[col - 1] = cellValue(c.value)));
    rows[n - 1] = vals;
  });

  // Header row: the first row (in the top 25) matching the most known header names
  let headerRow = 0, best = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = (rows[i] || []).map(norm);
    const score = r.filter((h) => h && Object.values(GUESS).some((re) => re.test(h))).length;
    const savedScore = saved ? [saved.suite, saved.tenant, saved.sqft].filter((h) => r.includes(h)).length * 3 : 0;
    if (score + savedScore > best) (best = score + savedScore), (headerRow = i);
  }
  const headers = (rows[headerRow] || []).map(norm);

  const guess = (k: keyof typeof GUESS) => headers.find((h) => h && GUESS[k].test(h)) || "";
  const mapping: ColumnMapping = saved
    ? { ...saved }
    : {
        suite: guess("suite"),
        tenant: guess("tenant"),
        sqft: guess("sqft"),
        loadingType: guess("loadingType"),
        streetNumber: guess("streetNumber"),
        share: guess("share"),
        comments: guess("comments"),
      };

  const idx = (h?: string) => (h ? headers.indexOf(h) : -1);
  const ci = {
    suite: idx(mapping.suite),
    tenant: idx(mapping.tenant),
    sqft: idx(mapping.sqft),
    loading: idx(mapping.loadingType),
    street: idx(mapping.streetNumber),
    comments: idx(mapping.comments),
  };
  const warnings: string[] = [];
  for (const [k, v] of Object.entries({ suite: ci.suite, tenant: ci.tenant, sqft: ci.sqft, "loading type": ci.loading }))
    if (v < 0) warnings.push(`Column for "${k}" not found — open Column Mapping to fix.`);

  const suites: Suite[] = [];
  if (ci.suite >= 0) {
    for (let i = headerRow + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const suite = norm(r[ci.suite]);
      if (!suite || !/^\d/.test(suite)) continue; // skips totals and blank rows
      const sqft = Number(String(r[ci.sqft] ?? "").replace(/[^\d.]/g, "")) || 0;
      const tenantRaw = ci.tenant >= 0 ? norm(r[ci.tenant]) : "";
      const loadingRaw = ci.loading >= 0 ? norm(r[ci.loading]) : "";
      // "LANDLORD SOLAR STORAGE" etc.: the landlord is using the space, so treat it as available.
      const landlordUse = /^landlord\b/i.test(tenantRaw);
      suites.push({
        suiteNumber: suite.replace(/,\s+/g, ", "),
        streetNumber: (ci.street >= 0 && norm(r[ci.street])) || streetFromSuite(suite),
        rentableSqFt: sqft,
        proportionateShare: proportionateShare(sqft, config.lease.totalBuildingSqFt),
        currentTenant: /^vacant\b/i.test(tenantRaw) || landlordUse ? "" : tenantRaw,
        landlordUse,
        loadingType: loadingFromValue(loadingRaw),
        loadingRaw,
        comments: ci.comments >= 0 ? norm(r[ci.comments]) : "",
      });
    }
  }

  return {
    fileName: wbFile.name,
    path: wbFile.path,
    sheets,
    headers: headers.filter(Boolean),
    headerRow: headerRow + 1,
    mapping,
    mappingSaved: !!saved && !override,
    suites,
    warnings,
  };
}
