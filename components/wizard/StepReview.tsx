"use client";
import { ReactNode } from "react";
import { addDays, anniversaryFor, escalationDates, firstEscalationFor, freeRentMonthLabel, isMidMonth, LeaseForm, possessionBreakdown, longDate, money, numberToWords, plainNumber, recalc, terminationFor } from "@/lib/lease";
import { Alert, Field, Section, TemplateBadge, Toggle } from "../ui";
import type { Touched, WizardState } from "./Wizard";

export function StepReview({ st, update, back, next }: { st: WizardState; update: (p: Partial<WizardState>) => void; back: () => void; next: () => void }) {
  const f = st.form;
  const t = st.touched;

  /** Apply a change and keep every derived field in sync. */
  function set(patch: Partial<LeaseForm>, touch?: keyof Touched, rent?: "annual" | "monthly") {
    const touched = touch ? { ...t, [touch]: true } : t;
    let n: LeaseForm = { ...f, ...patch };
    if ("commencementDate" in patch || "termMonths" in patch) {
      if (!touched.terminationDate) n.terminationDate = terminationFor(n.commencementDate, n.termMonths);
      if (!touched.anniversaryDate) n.anniversaryDate = anniversaryFor(n.commencementDate);
      if (!touched.firstEscalationDate) n.firstEscalationDate = firstEscalationFor(n.commencementDate);
    }
    if (("commencementDate" in patch || "termMonths" in patch || "terminationDate" in patch || "hasRenewalOption" in patch) && !touched.renewalStartDate)
      n.renewalStartDate = n.terminationDate ? addDays(n.terminationDate, 1) : "";
    n = recalc(n, rent, touched.securityDeposit);
    update({ form: n, touched });
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const escDates = escalationDates(f.firstEscalationDate, f.terminationDate);

  return (
    <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="space-y-5">
        {st.aiNotes.length > 0 && (
          <Alert tone="warn">
            <b>Notes from the AI extraction</b>
            <ul className="mt-1 list-disc pl-5">
              {st.aiNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Section title="Suite" right={<TemplateBadge t={f.template} />}>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Suite number">
              <input className="input" value={f.suiteNumber} onChange={(e) => set({ suiteNumber: e.target.value })} />
            </Field>
            <Field label="Street number">
              <input className="input" value={f.buildingStreetNumber} onChange={(e) => set({ buildingStreetNumber: e.target.value })} />
            </Field>
            <Field label="Rentable sq ft">
              <input className="input" type="number" value={f.rentableSqFt || ""} onChange={(e) => set({ rentableSqFt: num(e.target.value) })} />
            </Field>
            <Field label="Proportionate share %" hint="sq ft ÷ 159,600">
              <input className="input" value={f.proportionateShare} onChange={(e) => set({ proportionateShare: e.target.value })} />
            </Field>
          </div>
        </Section>

        <Section title="Tenant">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tenant legal name" className="sm:col-span-2">
              <input className="input" value={f.tenantLegalName} onChange={(e) => set({ tenantLegalName: e.target.value })} />
            </Field>
            <Field label="Notice address" className="sm:col-span-2">
              <input className="input" value={f.tenantNoticeAddress} onChange={(e) => set({ tenantNoticeAddress: e.target.value })} />
            </Field>
            <Field label="Tenant email">
              <input className="input" type="email" value={f.tenantEmail} onChange={(e) => set({ tenantEmail: e.target.value })} />
            </Field>
            <Field label="Tenant's broker email" hint="Used only for emailing drafts">
              <input className="input" type="email" value={f.tenantBrokerEmail} onChange={(e) => set({ tenantBrokerEmail: e.target.value })} />
            </Field>
            <Field label="Signer name">
              <input className="input" value={f.tenantSignerName} onChange={(e) => set({ tenantSignerName: e.target.value })} />
            </Field>
            <Field label="Signer title">
              <input className="input" value={f.tenantSignerTitle} onChange={(e) => set({ tenantSignerTitle: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Toggle
                checked={f.tenantIsIndividual}
                onChange={(v) => set({ tenantIsIndividual: v })}
                label="Tenant is an individual / sole proprietor (adds Exhibit A: notarized Sworn Statement of Business Purpose, Section 38)"
              />
            </div>
            {f.tenantIsIndividual && (
              <Field label="Business name the tenant operates under" hint="Printed on Exhibit A" className="sm:col-span-2">
                <input className="input" value={f.solePropBusinessName} onChange={(e) => set({ solePropBusinessName: e.target.value })} />
              </Field>
            )}
            {f.tenantIsIndividual && (
              <Field
                label="Type of business (required)"
                hint={
                  (f.solePropBusinessType || "").trim()
                    ? "Printed on Exhibit A, item 2 — the tenant swears to it before the notary"
                    : "Not found in the LOI / application — enter it here (e.g. “HVAC contracting”). The lease can't be generated without it."
                }
                className="sm:col-span-2"
              >
                <input
                  className={`input ${(f.solePropBusinessType || "").trim() ? "" : "border-amber-400 ring-1 ring-amber-300"}`}
                  value={f.solePropBusinessType || ""}
                  placeholder="e.g. HVAC contracting"
                  onChange={(e) => set({ solePropBusinessType: e.target.value })}
                />
              </Field>
            )}
          </div>
        </Section>

        <Section title="Dates & Term">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Effective date">
              <input className="input" type="date" value={f.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} />
            </Field>
            <Field label="Commencement date">
              <input className="input" type="date" value={f.commencementDate} onChange={(e) => set({ commencementDate: e.target.value })} />
            </Field>
            <Field label="Term (months)">
              <input className="input" type="number" min={1} value={f.termMonths || ""} onChange={(e) => set({ termMonths: num(e.target.value) })} />
            </Field>
            <Field label="Termination date" hint={t.terminationDate ? <ResetLink onClick={() => resetTouched("terminationDate")} /> : "Auto: term months (plus any partial first month) − 1 day"}>
              <input className="input" type="date" value={f.terminationDate} onChange={(e) => set({ terminationDate: e.target.value }, "terminationDate")} />
            </Field>
            <Field label="Anniversary date" hint={t.anniversaryDate ? <ResetLink onClick={() => resetTouched("anniversaryDate")} /> : "Auto: 1st day of the first full month"}>
              <input className="input" value={f.anniversaryDate} onChange={(e) => set({ anniversaryDate: e.target.value }, "anniversaryDate")} />
            </Field>
            <Field label="First rent escalation" hint={t.firstEscalationDate ? <ResetLink onClick={() => resetTouched("firstEscalationDate")} /> : "Auto: one year after the first full month"}>
              <input className="input" type="date" value={f.firstEscalationDate} onChange={(e) => set({ firstEscalationDate: e.target.value }, "firstEscalationDate")} />
            </Field>
            {isMidMonth(f.commencementDate) && (
              <p className="self-end text-xs text-amber-700 sm:col-span-2">
                Mid-month start: the Term includes the partial first month, and Clause 2 adds the mid-month sentence automatically.
              </p>
            )}
            <p className="text-xs text-stone-600 sm:col-span-3">
              <b>Rent increases during the Term: {escDates.length}</b>
              {escDates.length > 0 ? ` (${escDates.map(longDate).join("; ")})` : " — Base Rent is fixed; Clauses 2, 4(a) and 5 use the no-increase wording."}
            </p>
          </div>
        </Section>

        <Section title="Rent & NNN">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Initial annual base rent ($)">
              <input className="input" type="number" step="0.01" value={f.initialAnnualRent || ""} onChange={(e) => set({ initialAnnualRent: num(e.target.value) }, undefined, "annual")} />
            </Field>
            <Field label="Initial monthly base rent ($)" hint="= annual ÷ 12 (edit either one)">
              <input className="input" type="number" step="0.01" value={f.initialMonthlyRent || ""} onChange={(e) => set({ initialMonthlyRent: num(e.target.value) }, undefined, "monthly")} />
            </Field>
            <Field label="Annual escalation (%)" hint={escDates.length === 0 ? "Not used — no increase falls within the Term" : undefined}>
              <input className="input" type="number" step="0.1" value={f.escalationRate} onChange={(e) => set({ escalationRate: num(e.target.value) })} />
            </Field>
            <Field label="NNN estimate year" hint="Printed as “For calendar year …”">
              <input className="input" type="number" value={f.nnnYear || ""} onChange={(e) => set({ nnnYear: num(e.target.value) })} />
            </Field>
            <Field label="NNN rate ($ / sq ft / yr)" hint={`= $${money(f.rentableSqFt * f.nnnRate)} per year for this suite`}>
              <input className="input" type="number" step="0.01" value={f.nnnRate} onChange={(e) => set({ nnnRate: num(e.target.value) })} />
            </Field>
            <Field label="Est. monthly additional rent" hint={`${plainNumber(f.rentableSqFt)} sf × $${f.nnnRate} ÷ 12`}>
              <input className="input bg-stone-50" readOnly value={`$${money(f.estimatedMonthlyAdditionalRent)}`} />
            </Field>
            <Field label="Total initial monthly payment" hint="Base + additional rent">
              <input className="input bg-stone-50 font-semibold" readOnly value={`$${money(f.totalInitialMonthlyPayment)}`} />
            </Field>
            <Field label="Security deposit ($)" hint={t.securityDeposit ? <ResetLink onClick={() => resetTouched("securityDeposit")} /> : "Defaults to one total monthly payment"}>
              <input className="input" type="number" step="0.01" value={f.securityDeposit || ""} onChange={(e) => set({ securityDeposit: num(e.target.value) }, "securityDeposit")} />
            </Field>
            <Field
              label="Total due before possession"
              hint={`Deposit + first full month${possessionBreakdown(f).prorated ? ` + prorated partial month $${money(possessionBreakdown(f).prorated)}` : ""} — Section 4(e)`}
            >
              <input className="input bg-stone-50 font-semibold" readOnly value={`$${money(possessionBreakdown(f).total)}`} />
            </Field>
          </div>
        </Section>

        <Section title="Options">
          <div className="space-y-5">
            <div>
              <Toggle checked={!!f.hasFreeRent} onChange={(v) => set({ hasFreeRent: v, freeRentMonth: f.freeRentMonth || 2 })} label="Free rent (one month of Base Rent, Section 4(g))" />
              {f.hasFreeRent && (
                <div className="mt-3 grid gap-4 pl-14 sm:grid-cols-2">
                  <Field label="Free month (full calendar month of the Term)" hint={freeRentMonthLabel(f) ? `= ${freeRentMonthLabel(f)}; abated $${money(f.initialMonthlyRent)}` : "Set the commencement date"}>
                    <input className="input" type="number" min={1} max={12} value={f.freeRentMonth || ""} onChange={(e) => set({ freeRentMonth: num(e.target.value) })} />
                  </Field>
                  <p className="self-center text-xs text-stone-500">
                    Additional Rent is still due that month. The free rent is clawed back on any default, or if the tenant isn’t on autopay by the
                    Commencement Date (or cancels it and doesn’t reinstate it within 10 days).
                  </p>
                </div>
              )}
            </div>
            <div>
              <Toggle checked={f.hasRenewalOption} onChange={(v) => set({ hasRenewalOption: v })} label="Renewal option" />
              {f.hasRenewalOption && (
                <div className="mt-3 grid gap-4 pl-14 sm:grid-cols-2">
                  <Field label="Renewal years">
                    <input className="input" type="number" min={1} value={f.renewalYears || ""} onChange={(e) => set({ renewalYears: num(e.target.value) })} />
                  </Field>
                  <Field label="Renewal start date" hint={t.renewalStartDate ? <ResetLink onClick={() => resetTouched("renewalStartDate")} /> : "Auto: day after termination"}>
                    <input className="input" type="date" value={f.renewalStartDate} onChange={(e) => set({ renewalStartDate: e.target.value }, "renewalStartDate")} />
                  </Field>
                </div>
              )}
            </div>
            <div>
              <span className="label">Personal guarantors</span>
              <div className="flex gap-2">
                {([0, 1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set({ guarantorCount: n })}
                    className={`rounded-lg border px-4 py-1.5 text-sm ${f.guarantorCount === n ? "border-brand-600 bg-brand-50 font-semibold" : "border-stone-300"}`}
                  >
                    {n === 0 ? "None" : n}
                  </button>
                ))}
              </div>
              {f.guarantorCount > 0 && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Guarantor 1 name">
                    <input className="input" value={f.guarantor1Name} onChange={(e) => set({ guarantor1Name: e.target.value })} />
                  </Field>
                  <Field label="Guarantor 1 address">
                    <input className="input" value={f.guarantor1Address} onChange={(e) => set({ guarantor1Address: e.target.value })} />
                  </Field>
                  {f.guarantorCount > 1 && (
                    <>
                      <Field label="Guarantor 2 name">
                        <input className="input" value={f.guarantor2Name} onChange={(e) => set({ guarantor2Name: e.target.value })} />
                      </Field>
                      <Field label="Guarantor 2 address">
                        <input className="input" value={f.guarantor2Address} onChange={(e) => set({ guarantor2Address: e.target.value })} />
                      </Field>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section title="Special / custom provisions">
          <textarea
            className="input min-h-36 font-[inherit] leading-relaxed"
            placeholder="Optional. Anything typed here becomes numbered section “SPECIAL / CUSTOM PROVISIONS” before the signatures. Each new line stays a new line."
            value={f.customProvisions}
            onChange={(e) => set({ customProvisions: e.target.value })}
          />
        </Section>

        <Section title="Landlord signer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className="input" value={f.landlordSignerName} onChange={(e) => set({ landlordSignerName: e.target.value })} />
            </Field>
            <Field label="Title">
              <input className="input" value={f.landlordSignerTitle} onChange={(e) => set({ landlordSignerTitle: e.target.value })} />
            </Field>
          </div>
        </Section>

        <div className="flex gap-2">
          <button className="btn-secondary" onClick={back}>
            ← Back
          </button>
          <button className="btn-primary flex-1 py-2.5" onClick={next}>
            Continue to generate →
          </button>
        </div>
      </div>

      <Preview f={f} />
    </div>
  );

  function resetTouched(k: keyof Touched) {
    const touched = { ...t, [k]: false };
    let n = { ...f };
    if (k === "terminationDate") n.terminationDate = terminationFor(n.commencementDate, n.termMonths);
    if (k === "anniversaryDate") n.anniversaryDate = anniversaryFor(n.commencementDate);
    if (k === "firstEscalationDate") n.firstEscalationDate = firstEscalationFor(n.commencementDate);
    if (k === "renewalStartDate" || k === "terminationDate") n.renewalStartDate = n.terminationDate ? addDays(n.terminationDate, 1) : "";
    n = recalc(n, undefined, touched.securityDeposit);
    update({ form: n, touched });
  }
}

function ResetLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="text-brand-600 underline" onClick={onClick}>
      Edited by hand — reset to automatic
    </button>
  );
}

/** Live preview of the key clauses with the current values highlighted. */
function Preview({ f }: { f: LeaseForm }) {
  const escDates = escalationDates(f.firstEscalationDate, f.terminationDate);
  const V = ({ children }: { children: ReactNode }) => {
    const empty = children === "" || children === undefined || children === null;
    return (
      <mark className={`rounded px-1 ${empty ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-900"}`}>{empty ? "______" : children}</mark>
    );
  };
  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <div className="card max-h-[calc(100vh-3rem)] overflow-auto p-6 font-serif text-[13.5px] leading-relaxed text-stone-800">
        <div className="mb-3 flex items-center justify-between font-sans">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Live clause preview</span>
          <TemplateBadge t={f.template} />
        </div>
        <p>
          This Lease is made as of <V>{longDate(f.effectiveDate)}</V> between Bluewater Corporate Center, LLC (“Landlord”) and <V>{f.tenantLegalName}</V> (“Tenant”).
        </p>
        <p className="mt-3">
          <b>1. Premises.</b> Approximately <V>{plainNumber(f.rentableSqFt)}</V> rentable square feet known as Suite <V>{f.suiteNumber}</V> at{" "}
          <V>{f.buildingStreetNumber}</V> Roger B. Chaffee Memorial Blvd. SE — Proportionate Share <V>{f.proportionateShare}%</V> of 159,600 sq ft.
        </p>
        <p className="mt-3">
          <b>2. Term.</b> <V>{f.termMonths ? `${numberToWords(f.termMonths)} (${f.termMonths})` : ""}</V> months, commencing on{" "}
          <V>{longDate(f.commencementDate)}</V> and terminating on <V>{longDate(f.terminationDate)}</V>, unless sooner terminated or extended.{" "}
          {escDates.length === 0 && <>The Base Rent shall remain fixed for the entire Term, and no Rent escalation shall occur during the Term.</>}
          {escDates.length === 1 && (
            <>
              The Base Rent shall increase once during the Term, on <V>{longDate(escDates[0])}</V> (the “Anniversary Date”).
            </>
          )}
          {escDates.length > 1 && (
            <>
              The Base Rent shall increase on <V>{f.anniversaryDate}</V> of each year during the Term, beginning <V>{longDate(escDates[0])}</V>, with the final increase on{" "}
              <V>{longDate(escDates[escDates.length - 1])}</V>.
            </>
          )}
          {isMidMonth(f.commencementDate) && (
            <span className="text-stone-500"> + mid-month sentence (partial first month; Anniversary Date is the 1st of the first full month).</span>
          )}
        </p>
        <p className="mt-3">
          <b>3. Renewal.</b>{" "}
          {f.hasRenewalOption ? (
            <>
              One option to renew for <V>{f.renewalYears || ""}</V> additional years starting <V>{longDate(f.renewalStartDate)}</V>, by written
              notice at least 90 days before the Termination Date (no Event of Default; original Tenant only).
            </>
          ) : (
            <>No option to renew. </>
          )}{" "}
          Otherwise the Lease ends on the Termination Date; staying on needs a new signed lease or amendment, or holdover applies (150% of
          Base Rent plus all Additional Rent).
        </p>
        <p className="mt-3">
          <b>4. Rent.</b> Annual Base Rent <V>${money(f.initialAnnualRent)}</V>, payable <V>${money(f.initialMonthlyRent)}</V> monthly
          {escDates.length === 0 ? ", fixed for the Term (holdover: 150% of Base Rent plus Additional Rent)." : (
            <>
              , increasing <V>{plainNumber(f.escalationRate)}%</V> {escDates.length === 1 ? "on the Anniversary Date" : "each Anniversary Date"}.
            </>
          )} Additional Rent for calendar year <V>{f.nnnYear}</V> is estimated at <V>${money(f.nnnRate)}</V>/sq ft/yr: for{" "}
          {plainNumber(f.rentableSqFt)} sq ft, <V>${money(f.rentableSqFt * f.nnnRate)}</V> annually, or <V>${money(f.estimatedMonthlyAdditionalRent)}</V> per month.{" "}
          <b>Total initial monthly payment</b> <V>${money(f.totalInitialMonthlyPayment)}</V> per month to start — the first payment is due at signing.
        </p>
        <p className="mt-3">
          <b>4(e) Total Due Before Possession.</b> <V>${money(possessionBreakdown(f).total)}</V> in cleared funds before keys: deposit{" "}
          <V>${money(possessionBreakdown(f).deposit)}</V> + first full month <V>${money(possessionBreakdown(f).firstMonth)}</V>
          {possessionBreakdown(f).prorated > 0 && (
            <>
              {" "}
              + prorated partial month <V>${money(possessionBreakdown(f).prorated)}</V>
            </>
          )}
          .
        </p>
        {f.hasFreeRent && (
          <p className="mt-3">
            <b>4(g) Base Rent Abatement.</b> Base Rent for full month <V>{f.freeRentMonth}</V> (<V>{freeRentMonthLabel(f)}</V>) is abated —{" "}
            <V>${money(f.initialMonthlyRent)}</V>; Additional Rent still due; clawed back on default or autopay failure.
          </p>
        )}
        <p className="mt-3">
          <b>7.1 Security Deposit.</b> <V>${money(f.securityDeposit)}</V>, due at signing with the first total monthly payment.
        </p>
        {f.customProvisions.trim() && (
          <p className="mt-3 whitespace-pre-wrap">
            <b>Special / Custom Provisions.</b> <V>{f.customProvisions.trim()}</V>
          </p>
        )}
        <div className="mt-4 border-t border-stone-200 pt-3 font-sans text-xs text-stone-600">
          <div>
            <b>Tenant signs:</b> {f.tenantSignerName || "—"}
            {f.tenantSignerTitle && `, ${f.tenantSignerTitle}`}
          </div>
          <div>
            <b>Landlord signs:</b> {f.landlordSignerName || "—"}
            {f.landlordSignerTitle && `, ${f.landlordSignerTitle}`}
          </div>
          <div>
            <b>Guarantors:</b>{" "}
            {f.guarantorCount === 0 ? "None" : [f.guarantor1Name, f.guarantorCount > 1 ? f.guarantor2Name : ""].filter(Boolean).join(" & ") || "names missing"}
            {f.guarantorCount > 0 && " — full Guaranty paragraph on its own page"}
          </div>
          {f.tenantIsIndividual && (
            <div>
              <b>Exhibit A:</b> notarized Sworn Statement of Business Purpose (tenant signs before a notary and uploads it when signing)
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
