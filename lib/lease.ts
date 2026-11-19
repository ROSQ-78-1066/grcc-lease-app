// Shared (client + server) lease data model, calculations and formatting.

export type TemplateKey = "A" | "B";

/**
 * Display names for the two lease forms. The internal keys stay "A"/"B" so saved
 * deals and the template file paths keep working:
 *   A = dock-high suites in Buildings C & D  → "Lease CD"
 *   B = overhead-door suites in Buildings A & B → "Lease AB"
 */
export const TEMPLATE_LABEL: Record<TemplateKey, { code: string; name: string; full: string }> = {
  A: { code: "CD", name: "Shipping Docks", full: "Lease CD · Shipping Docks (Bldgs C & D)" },
  B: { code: "AB", name: "Overhead Doors", full: "Lease AB · Overhead Doors (Bldgs A & B)" },
};

export interface Suite {
  suiteNumber: string;
  streetNumber: string;
  rentableSqFt: number;
  proportionateShare: string; // percent, 2 decimals
  currentTenant: string; // "" when vacant or used by the landlord
  landlordUse: boolean; // e.g. "LANDLORD SOLAR STORAGE": no tenant, but rentable
  loadingType: TemplateKey | null;
  loadingRaw: string;
  comments: string;
}

export interface LeaseForm {
  dealType: "renewal" | "new";
  template: TemplateKey;
  // Suite
  suiteNumber: string;
  buildingStreetNumber: string;
  rentableSqFt: number;
  proportionateShare: string;
  // Dates & term (ISO yyyy-mm-dd)
  effectiveDate: string;
  commencementDate: string;
  termMonths: number;
  terminationDate: string;
  anniversaryDate: string; // e.g. "January 1st"
  firstEscalationDate: string; // ISO; first Rent increase
  // Tenant
  tenantLegalName: string;
  tenantNoticeAddress: string;
  tenantEmail: string;
  tenantSignerName: string;
  tenantSignerTitle: string;
  solePropBusinessName: string;
  solePropBusinessType: string; // Exhibit A item 2: type of business (required for individual tenants)
  tenantIsIndividual: boolean; // individual / sole proprietor → Exhibit A (notarized business-purpose statement)
  tenantBrokerEmail: string;
  // Landlord
  landlordSignerName: string;
  landlordSignerTitle: string;
  // Financials
  initialAnnualRent: number;
  initialMonthlyRent: number;
  escalationRate: number; // percent
  nnnRate: number; // $/sq ft/yr
  nnnYear: number; // calendar year the NNN estimate applies to
  estimatedMonthlyAdditionalRent: number;
  totalInitialMonthlyPayment: number;
  securityDeposit: number;
  // Free rent (Section 4(g)): one month of Base Rent abated, clawed back on default / autopay failure
  hasFreeRent: boolean;
  freeRentMonth: number; // which full calendar month of the Term (default 2)
  // Options
  hasRenewalOption: boolean;
  renewalYears: number;
  renewalStartDate: string;
  customProvisions: string;
  guarantorCount: 0 | 1 | 2;
  guarantor1Name: string;
  guarantor1Address: string;
  guarantor2Name: string;
  guarantor2Address: string;
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function proportionateShare(sqft: number, total: number): string {
  if (!sqft || !total) return "";
  return ((sqft / total) * 100).toFixed(2);
}

// ---------- dates ----------
export function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  if (!d) return "";
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return toISO(t);
}
export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
/** True when the lease starts on any day other than the 1st (Clause 2 mid-month sentence). */
export function isMidMonth(commencement: string): boolean {
  const d = parseISO(commencement);
  return !!d && d.getUTCDate() !== 1;
}
/**
 * First day of the first FULL calendar month of the Term.
 * Starts on the 1st → the commencement date itself; mid-month → the 1st of the next month.
 */
export function firstFullMonth(commencement: string): string {
  const d = parseISO(commencement);
  if (!d) return "";
  if (d.getUTCDate() === 1) return commencement;
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}
/**
 * Termination per Clause 2: the Term is `months` full calendar months, plus the
 * partial first month when the lease starts mid-month.
 * Feb 1, 2027 + 36 → Jan 31, 2030.  Nov 15, 2026 + 36 → Nov 30, 2029.
 */
export function terminationFor(commencement: string, months: number): string {
  if (!commencement || !months) return "";
  return addDays(addMonths(firstFullMonth(commencement), months), -1);
}
/**
 * Every Rent escalation date that falls inside the Term: the first escalation,
 * then each 12 months after it, up to and including the Termination Date.
 */
export function escalationDates(firstEscalation: string, termination: string): string[] {
  const out: string[] = [];
  if (!firstEscalation || !termination) return out;
  for (let k = 0; k < 100; k++) {
    const d = addMonths(firstEscalation, 12 * k);
    if (!d || d > termination) break;
    out.push(d);
  }
  return out;
}
/** First Rent escalation: one year after the first full month begins. */
export function firstEscalationFor(commencement: string): string {
  const s = firstFullMonth(commencement);
  return s ? addMonths(s, 12) : "";
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
/** Anniversary Date ("February 1st"): the first day of the first full month of the Term. */
export function anniversaryFor(commencement: string): string {
  const d = parseISO(firstFullMonth(commencement));
  return d ? `${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}` : "";
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** 36 → "thirty-six", 120 → "one hundred twenty" (whole numbers 0–999). */
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numberToWords(n % 100) : "");
  return String(n);
}
export function longDate(iso: string): string {
  const d = parseISO(iso);
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : iso || "";
}

// ---------- numbers ----------
export function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function plainNumber(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** Recompute the derived money fields. `changed` says which rent field the user edited. */
export function recalc(f: LeaseForm, changed?: "annual" | "monthly", depositTouched = false): LeaseForm {
  const out = { ...f };
  if (changed === "monthly") out.initialAnnualRent = round2(out.initialMonthlyRent * 12);
  else out.initialMonthlyRent = round2(out.initialAnnualRent / 12);
  out.estimatedMonthlyAdditionalRent = round2((out.rentableSqFt * out.nnnRate) / 12);
  out.totalInitialMonthlyPayment = round2(out.initialMonthlyRent + out.estimatedMonthlyAdditionalRent);
  if (!depositTouched) out.securityDeposit = out.totalInitialMonthlyPayment;
  return out;
}

export function emptyForm(): LeaseForm {
  return {
    dealType: "new",
    template: "A",
    suiteNumber: "",
    buildingStreetNumber: "",
    rentableSqFt: 0,
    proportionateShare: "",
    effectiveDate: toISO(new Date()),
    commencementDate: "",
    termMonths: 36,
    terminationDate: "",
    anniversaryDate: "",
    firstEscalationDate: "",
    tenantLegalName: "",
    tenantNoticeAddress: "",
    tenantEmail: "",
    tenantSignerName: "",
    tenantSignerTitle: "",
    solePropBusinessName: "",
    solePropBusinessType: "",
    tenantIsIndividual: false,
    tenantBrokerEmail: "",
    landlordSignerName: "",
    landlordSignerTitle: "",
    initialAnnualRent: 0,
    initialMonthlyRent: 0,
    escalationRate: 3,
    nnnRate: 2.65,
    nnnYear: new Date().getFullYear(),
    estimatedMonthlyAdditionalRent: 0,
    totalInitialMonthlyPayment: 0,
    securityDeposit: 0,
    hasFreeRent: false,
    freeRentMonth: 2,
    hasRenewalOption: false,
    renewalYears: 3,
    renewalStartDate: "",
    customProvisions: "",
    guarantorCount: 0,
    guarantor1Name: "",
    guarantor1Address: "",
    guarantor2Name: "",
    guarantor2Address: "",
  };
}

const BLANK_LINE = "______________________________________________________";

/** Values for the docx merge tags (identical in both templates). */
export function mergeData(f: LeaseForm): Record<string, string | boolean> {
  return {
    EFFECTIVE_DATE: longDate(f.effectiveDate),
    TERM_MONTHS: String(f.termMonths || ""),
    TERM_MONTHS_WORDS: f.termMonths ? numberToWords(f.termMonths) : "",
    FIRST_ESCALATION_DATE: longDate(f.firstEscalationDate),
    IS_MID_MONTH_START: isMidMonth(f.commencementDate),
    ...escalationTags(f),
    COMMENCEMENT_DATE: longDate(f.commencementDate),
    TERMINATION_DATE: longDate(f.terminationDate),
    ANNIVERSARY_DATE: f.anniversaryDate,
    BUILDING_STREET_NUMBER: f.buildingStreetNumber,
    SUITE_NUMBER: f.suiteNumber,
    RENTABLE_SQ_FT: plainNumber(f.rentableSqFt),
    PROPORTIONATE_SHARE: f.proportionateShare,
    TENANT_LEGAL_NAME: f.tenantLegalName,
    TENANT_NOTICE_ADDRESS: f.tenantNoticeAddress,
    TENANT_EMAIL: f.tenantEmail,
    TENANT_SIGNER_NAME: f.tenantSignerName,
    TENANT_SIGNER_TITLE: f.tenantSignerTitle,
    IS_INDIVIDUAL_TENANT: !!f.tenantIsIndividual,
    SOLE_PROP_BUSINESS_NAME: (f.solePropBusinessName || "").trim() || "______________________________",
    SOLE_PROP_BUSINESS_TYPE: (f.solePropBusinessType || "").trim() || "______________________________",
    LANDLORD_SIGNER_NAME: f.landlordSignerName,
    LANDLORD_SIGNER_TITLE: f.landlordSignerTitle,
    INITIAL_ANNUAL_RENT: money(f.initialAnnualRent),
    INITIAL_MONTHLY_RENT: money(f.initialMonthlyRent),
    ESCALATION_RATE: plainNumber(f.escalationRate),
    ESTIMATED_MONTHLY_ADDITIONAL_RENT: money(f.estimatedMonthlyAdditionalRent),
    ESTIMATED_ANNUAL_ADDITIONAL_RENT: money(round2(f.rentableSqFt * f.nnnRate)),
    NNN_RATE: money(f.nnnRate),
    NNN_YEAR: String(f.nnnYear || new Date().getFullYear()),
    TOTAL_INITIAL_MONTHLY_PAYMENT: money(f.totalInitialMonthlyPayment),
    SECURITY_DEPOSIT: money(f.securityDeposit),
    ...possessionTags(f),
    HAS_RENEWAL_OPTION: !!f.hasRenewalOption,
    RENEWAL_YEARS: String(f.renewalYears || ""),
    RENEWAL_START_DATE: longDate(f.renewalStartDate),
    HAS_CUSTOM_PROVISIONS: !!f.customProvisions.trim(),
    CUSTOM_PROVISIONS: f.customProvisions.trim(),
    HAS_GUARANTORS: f.guarantorCount > 0,
    GUARANTOR_1_NAME: f.guarantor1Name,
    GUARANTOR_1_ADDRESS: (f.guarantor1Address || "").trim() || BLANK_LINE,
    HAS_SECOND_GUARANTOR: f.guarantorCount > 1,
    GUARANTOR_2_NAME: f.guarantor2Name,
    GUARANTOR_2_ADDRESS: (f.guarantor2Address || "").trim() || BLANK_LINE,
  };
}

const ORD_WORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

/** Calendar month that the free-rent month falls in, e.g. "March 2027". */
export function freeRentMonthLabel(f: Pick<LeaseForm, "commencementDate" | "freeRentMonth">): string {
  const start = firstFullMonth(f.commencementDate);
  const d = parseISO(start ? addMonths(start, (f.freeRentMonth || 2) - 1) : "");
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "";
}

/** Rent for the partial first month (mid-month start), prorated by day on the total monthly payment. */
export function proratedFirstMonth(f: Pick<LeaseForm, "commencementDate" | "totalInitialMonthlyPayment">): number {
  const d = parseISO(f.commencementDate);
  if (!d || d.getUTCDate() === 1) return 0;
  const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return round2((f.totalInitialMonthlyPayment * (days - d.getUTCDate() + 1)) / days);
}

/** Section 4(e) "Total Due Before Possession" breakdown. */
export function possessionBreakdown(f: LeaseForm) {
  const firstMonth = round2(
    f.hasFreeRent && (f.freeRentMonth || 2) === 1 ? f.estimatedMonthlyAdditionalRent : f.totalInitialMonthlyPayment,
  );
  const prorated = proratedFirstMonth(f);
  return { deposit: round2(f.securityDeposit), firstMonth, prorated, total: round2(f.securityDeposit + firstMonth + prorated) };
}

function possessionTags(f: LeaseForm) {
  const b = possessionBreakdown(f);
  const n = Math.min(Math.max(Math.round(f.freeRentMonth || 2), 1), 12);
  return {
    FIRST_MONTH_PAYMENT: money(b.firstMonth),
    PRORATED_FIRST_MONTH: money(b.prorated),
    TOTAL_DUE_BEFORE_POSSESSION: money(b.total),
    HAS_FREE_RENT: !!f.hasFreeRent,
    FREE_RENT_MONTH_TEXT: `${ORD_WORDS[n]} (${ordinal(n)})`,
    FREE_RENT_MONTH_LABEL: freeRentMonthLabel(f),
    ABATED_RENT: money(f.initialMonthlyRent),
  };
}

/** Which Clause 2 / 4(a) / 5 wording applies: no increase, one, or two or more. */
function escalationTags(f: LeaseForm) {
  const dates = escalationDates(f.firstEscalationDate, f.terminationDate);
  return {
    HAS_ESCALATION: dates.length > 0,
    ESC_NONE: dates.length === 0,
    ESC_ONE: dates.length === 1,
    ESC_MULTI: dates.length > 1,
    LAST_ESCALATION_DATE: dates.length ? longDate(dates[dates.length - 1]) : "",
  };
}

/** Egnyte forbids \ / : * ? " < > | in names. */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}
export function dealKey(f: Pick<LeaseForm, "suiteNumber" | "tenantLegalName">): string {
  return safeName(`Unit ${f.suiteNumber} - ${f.tenantLegalName}`);
}

export function missingFields(f: LeaseForm): string[] {
  const m: string[] = [];
  const req: [keyof LeaseForm, string][] = [
    ["suiteNumber", "Suite number"],
    ["buildingStreetNumber", "Street number"],
    ["tenantLegalName", "Tenant legal name"],
    ["effectiveDate", "Effective date"],
    ["commencementDate", "Commencement date"],
    ["terminationDate", "Termination date"],
    ["tenantSignerName", "Tenant signer name"],
  ];
  for (const [k, label] of req) if (!f[k]) m.push(label);
  if (!f.rentableSqFt) m.push("Rentable sq ft");
  if (!f.initialAnnualRent) m.push("Initial annual rent");
  if (f.hasFreeRent && !(f.freeRentMonth >= 1 && f.freeRentMonth <= 12)) m.push("Free rent month (1–12)");
  if (f.hasRenewalOption && (!f.renewalYears || !f.renewalStartDate)) m.push("Renewal years / start date");
  if (f.guarantorCount >= 1 && !f.guarantor1Name) m.push("Guarantor 1 name");
  if (f.guarantorCount >= 1 && !(f.guarantor1Address || "").trim()) m.push("Guarantor 1 address");
  if (f.guarantorCount >= 2 && !f.guarantor2Name) m.push("Guarantor 2 name");
  if (f.guarantorCount >= 2 && !(f.guarantor2Address || "").trim()) m.push("Guarantor 2 address");
  if (f.tenantIsIndividual && !(f.solePropBusinessName || "").trim()) m.push("Business name (individual tenant)");
  if (f.tenantIsIndividual && !(f.solePropBusinessType || "").trim()) m.push("Type of business (individual tenant, Exhibit A)");
  return m;
}
