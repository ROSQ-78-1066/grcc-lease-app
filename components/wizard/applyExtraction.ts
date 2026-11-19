import type { Extracted } from "@/lib/ai";
import { addDays, anniversaryFor, firstEscalationFor, LeaseForm, money, recalc, round2, terminationFor } from "@/lib/lease";

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Merge AI-extracted terms into the form. Returns the new form and notes for the broker. */
export function applyExtraction(form: LeaseForm, x: Extracted, dealType: "renewal" | "new"): { form: LeaseForm; notes: string[]; filled: string[] } {
  const f: LeaseForm = { ...form };
  const notes: string[] = [];
  const filled: string[] = [];
  const set = <K extends keyof LeaseForm>(k: K, v: LeaseForm[K] | undefined | null, label: string) => {
    if (v === undefined || v === null || v === "" || (typeof v === "number" && !isFinite(v))) return;
    f[k] = v as LeaseForm[K];
    filled.push(label);
  };

  set("tenantLegalName", x.tenant_legal_name?.trim(), "Tenant name");
  set("tenantNoticeAddress", x.tenant_notice_address?.trim(), "Notice address");
  set("tenantEmail", x.tenant_email?.trim(), "Tenant email");
  set("tenantSignerName", x.tenant_signer_name?.trim(), "Signer name");
  set("tenantSignerTitle", x.tenant_signer_title?.trim(), "Signer title");
  set("solePropBusinessName", x.sole_prop_business_name?.trim(), "Sole-prop business name");
  set("solePropBusinessType", x.sole_prop_business_type?.trim(), "Sole-prop type of business");
  if (x.tenant_is_individual || x.sole_prop_business_name?.trim()) {
    f.tenantIsIndividual = true;
    filled.push("Individual tenant (Exhibit A)");
  }
  set("tenantBrokerEmail", x.tenant_broker_email?.trim(), "Tenant broker email");
  set("escalationRate", x.escalation_rate_percent, "Escalation");

  const g = (x.guarantor_names || []).map((s) => s.trim()).filter(Boolean).slice(0, 2);
  if (g.length) {
    f.guarantorCount = g.length as 1 | 2;
    f.guarantor1Name = g[0] || "";
    f.guarantor2Name = g[1] || "";
    const a = (x.guarantor_addresses || []).map((s) => (s || "").trim());
    f.guarantor1Address = a[0] || f.guarantor1Address;
    f.guarantor2Address = a[1] || f.guarantor2Address;
    filled.push(`Guarantors (${g.length})`);
  }

  if (dealType === "renewal") {
    // New term starts the day after the existing lease ends
    if (isDate(x.termination_date)) {
      f.commencementDate = addDays(x.termination_date!, 1);
      notes.push(`Existing lease ends ${x.termination_date}; renewal commencement set to the next day.`);
      filled.push("Commencement date");
    }
    if (x.term_months) f.termMonths = x.term_months;
    const esc = x.escalation_rate_percent ?? f.escalationRate;
    if (x.current_final_year_annual_rent) {
      f.initialAnnualRent = round2(x.current_final_year_annual_rent * (1 + (esc || 0) / 100));
      notes.push(
        `Proposed renewal rent = final-year rent $${money(x.current_final_year_annual_rent)} + ${esc}% = $${money(f.initialAnnualRent)}/yr. Adjust if the deal differs.`,
      );
      filled.push("Proposed rent");
    }
    if (x.security_deposit) notes.push(`Existing security deposit on file: $${money(x.security_deposit)}.`);
  } else {
    set("effectiveDate", isDate(x.effective_date) ? x.effective_date : undefined, "Effective date");
    set("commencementDate", isDate(x.commencement_date) ? x.commencement_date : undefined, "Commencement date");
    set("termMonths", x.term_months, "Term");
    if (x.initial_annual_rent) set("initialAnnualRent", x.initial_annual_rent, "Annual rent");
    else if (x.initial_monthly_rent) {
      f.initialAnnualRent = round2(x.initial_monthly_rent * 12);
      filled.push("Rent (from monthly)");
    }
    if (x.security_deposit) set("securityDeposit", x.security_deposit, "Security deposit");
    if (x.free_rent_month && x.free_rent_month >= 1 && x.free_rent_month <= 12) {
      f.hasFreeRent = true;
      f.freeRentMonth = x.free_rent_month;
      filled.push("Free rent month");
    }
    if (x.has_renewal_option) {
      f.hasRenewalOption = true;
      if (x.renewal_years) f.renewalYears = x.renewal_years;
      if (isDate(x.renewal_start_date)) f.renewalStartDate = x.renewal_start_date!;
      filled.push("Renewal option");
    }
    if (x.special_provisions?.trim()) {
      f.customProvisions = x.special_provisions.trim();
      filled.push("Special provisions");
    }
  }

  // Derived dates
  if (f.commencementDate) {
    f.terminationDate = dealType === "new" && isDate(x.termination_date) ? x.termination_date! : terminationFor(f.commencementDate, f.termMonths);
    f.anniversaryDate = anniversaryFor(f.commencementDate);
    f.firstEscalationDate = firstEscalationFor(f.commencementDate);
    if (f.hasRenewalOption && !f.renewalStartDate) f.renewalStartDate = addDays(f.terminationDate, 1);
  }

  if (x.suite_number_mentioned && !x.suite_number_mentioned.includes(form.suiteNumber.split(",")[0].trim()))
    notes.push(`The document mentions suite “${x.suite_number_mentioned}”, but you selected Unit ${form.suiteNumber}.`);
  if (x.rentable_sq_ft_mentioned && form.rentableSqFt && Math.abs(x.rentable_sq_ft_mentioned - form.rentableSqFt) > 1)
    notes.push(`The document says ${x.rentable_sq_ft_mentioned.toLocaleString()} sq ft; the master sheet says ${form.rentableSqFt.toLocaleString()}. The sheet value is used.`);
  if (x.notes?.trim()) notes.push(x.notes.trim());

  return { form: recalc(f, undefined, !!x.security_deposit && dealType === "new"), notes, filled };
}
