import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { config } from "./config";
import { StorageError } from "./storage/types";

export interface SourceDoc {
  name: string;
  data: Buffer;
}

export interface Extracted {
  tenant_legal_name?: string;
  tenant_notice_address?: string;
  tenant_email?: string;
  tenant_signer_name?: string;
  tenant_signer_title?: string;
  sole_prop_business_name?: string;
  sole_prop_business_type?: string;
  tenant_is_individual?: boolean;
  tenant_broker_email?: string;
  effective_date?: string;
  commencement_date?: string;
  term_months?: number;
  termination_date?: string;
  initial_annual_rent?: number;
  initial_monthly_rent?: number;
  current_final_year_annual_rent?: number;
  escalation_rate_percent?: number;
  security_deposit?: number;
  has_renewal_option?: boolean;
  renewal_years?: number;
  renewal_start_date?: string;
  guarantor_names?: string[];
  guarantor_addresses?: string[];
  special_provisions?: string;
  suite_number_mentioned?: string;
  rentable_sq_ft_mentioned?: number;
  notes?: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    tenant_legal_name: { type: "string", description: "Exact legal entity name of the tenant (e.g. 'Acme Logistics, LLC')." },
    tenant_notice_address: { type: "string", description: "Tenant mailing/notice address, one line." },
    tenant_email: { type: "string" },
    tenant_signer_name: { type: "string", description: "Person who signs for the tenant." },
    tenant_signer_title: { type: "string", description: "Signer's title, e.g. Owner, Member, President." },
    sole_prop_business_name: { type: "string", description: "Only if the tenant is a sole proprietor/individual: the exact business name they operate under." },
    sole_prop_business_type: { type: "string", description: "Only if the tenant is a sole proprietor/individual: a short description of the type of business they are engaged in (e.g. \"HVAC contracting\", \"auto repair\", \"light manufacturing and warehousing\"), taken from the LOI or tenant application. Omit if the documents do not say; do not guess." },
    tenant_is_individual: { type: "boolean", description: "True if the tenant is a natural person or sole proprietor (not an LLC, corporation, partnership or other entity)." },
    tenant_broker_email: { type: "string", description: "Email of the tenant's broker, if any." },
    effective_date: { type: "string", description: "YYYY-MM-DD" },
    commencement_date: { type: "string", description: "YYYY-MM-DD" },
    term_months: { type: "integer" },
    termination_date: { type: "string", description: "YYYY-MM-DD" },
    initial_annual_rent: { type: "number", description: "First-year annual BASE rent in dollars (exclude NNN/additional rent)." },
    initial_monthly_rent: { type: "number", description: "First-year monthly BASE rent in dollars." },
    current_final_year_annual_rent: { type: "number", description: "For an existing lease being renewed: annual base rent in the lease's final year." },
    escalation_rate_percent: { type: "number", description: "Annual base-rent increase in percent, e.g. 3 for 3%." },
    security_deposit: { type: "number" },
    has_renewal_option: { type: "boolean" },
    renewal_years: { type: "integer" },
    renewal_start_date: { type: "string", description: "YYYY-MM-DD" },
    guarantor_names: { type: "array", items: { type: "string" }, description: "Personal guarantors (max 2)." },
    guarantor_addresses: { type: "array", items: { type: "string" }, description: "Home address of each personal guarantor, one line each, in the same order as guarantor_names. Empty string if not stated." },
    special_provisions: { type: "string", description: "Deal-specific terms not covered by the standard fields (free rent, TI allowance, landlord work, early access, etc.), written as lease-ready sentences. Empty if none." },
    suite_number_mentioned: { type: "string" },
    rentable_sq_ft_mentioned: { type: "number" },
    notes: { type: "string", description: "Short notes for the broker: conflicts between documents, missing items, assumptions made." },
  },
  additionalProperties: false,
} as const;

async function toBlocks(docs: SourceDoc[]): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const d of docs) {
    const ext = d.name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: d.data.toString("base64") },
        title: d.name,
      });
    } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      blocks.push({ type: "text", text: `Image file: ${d.name}` });
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: ext === "png" ? "image/png" : "image/jpeg", data: d.data.toString("base64") },
      });
    } else {
      let text = "";
      if (ext === "docx") text = (await mammoth.extractRawText({ buffer: d.data })).value;
      else text = d.data.toString("utf8");
      blocks.push({ type: "text", text: `<document name="${d.name}">\n${text.slice(0, 150_000)}\n</document>` });
    }
  }
  return blocks;
}

export async function extractLeaseTerms(
  docs: SourceDoc[],
  ctx: { dealType: "renewal" | "new"; suiteNumber: string; currentTenant?: string; today: string },
): Promise<Extracted> {
  if (!config.anthropic.apiKey)
    throw new StorageError("ANTHROPIC_API_KEY is not set, so AI extraction is unavailable. Enter the terms manually.", 400);
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const guidance =
    ctx.dealType === "renewal"
      ? `These documents are the tenant's EXISTING executed lease for suite ${ctx.suiteNumber}${ctx.currentTenant ? ` (current tenant: ${ctx.currentTenant})` : ""}. We are drafting a RENEWAL lease.
- Extract tenant identity, notice address, email, signer and guarantors from the existing lease.
- Put the existing lease's termination date in termination_date, its term in term_months, and its final-year annual base rent in current_final_year_annual_rent.
- Report the existing escalation rate and security deposit.
- Leave commencement_date, effective_date, initial_annual_rent empty; the app proposes renewal terms from these values.`
      : `These documents are a Letter of Intent and/or Tenant Application for a NEW lease of suite ${ctx.suiteNumber}.
- Extract the proposed lease terms. If documents conflict, prefer the LOI for economic terms and the application for tenant identity/contact details, and mention the conflict in notes.
- If only monthly or only annual base rent is given, fill the one given.
- If term is given in years, convert to months. If a commencement date and term are given but no termination date, leave termination_date empty.`;

  const msg = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 4000,
    tools: [
      {
        name: "record_lease_terms",
        description: "Record the lease terms found in the documents. Omit any field that is not stated; never guess.",
        input_schema: SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "record_lease_terms" },
    messages: [
      {
        role: "user",
        content: [
          ...(await toBlocks(docs)),
          {
            type: "text",
            text: `You extract commercial NNN lease terms for a broker. Today is ${ctx.today}.\n${guidance}\nDates must be YYYY-MM-DD. Money is a plain number of dollars. Call record_lease_terms once.`,
          },
        ],
      },
    ],
  });
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("The AI did not return structured terms.");
  return tool.input as Extracted;
}
