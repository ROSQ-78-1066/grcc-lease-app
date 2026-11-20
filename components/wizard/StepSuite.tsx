"use client";
import { allLeases, LeaseViewerButton } from "../LeaseViewer";
import { useEffect, useMemo, useState } from "react";
import { recalc, Suite, TEMPLATE_LABEL, TemplateKey } from "@/lib/lease";
import { MappingModal, SuitesInfo } from "../MappingModal";
import { Alert, api, Spinner, TemplateBadge } from "../ui";
import type { WizardState } from "./Wizard";

interface Defaults {
  nnnRate: number;
  totalBuildingSqFt: number;
  landlordSignerName: string;
  landlordSignerTitle: string;
  landlordEmail: string;
}

export function StepSuite({ st, update, next }: { st: WizardState; update: (p: Partial<WizardState>) => void; next: () => void }) {
  const [info, setInfo] = useState<(SuitesInfo & { defaults: Defaults }) | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState(st.suite?.suiteNumber || "");
  const [showMap, setShowMap] = useState(false);

  // Start reading the lease list now, so "View existing lease" is ready when a suite is picked.
  useEffect(() => {
    allLeases().catch(() => {});
  }, []);

  useEffect(() => {
    api<SuitesInfo & { defaults: Defaults }>("/api/suites")
      .then(setInfo)
      .catch((e) => setErr(e.message));
  }, []);

  const matches = useMemo(() => {
    if (!info) return [];
    const t = q.trim().toLowerCase();
    return info.suites.filter((s) => !t || s.suiteNumber.toLowerCase().includes(t) || s.currentTenant.toLowerCase().includes(t));
  }, [info, q]);

  function choose(s: Suite) {
    const d = info!.defaults;
    setQ(s.suiteNumber);
    const f = {
      ...st.form,
      suiteNumber: s.suiteNumber,
      buildingStreetNumber: s.streetNumber,
      rentableSqFt: s.rentableSqFt,
      proportionateShare: s.proportionateShare,
      template: (s.loadingType || st.form.template) as TemplateKey,
      dealType: s.currentTenant ? ("renewal" as const) : ("new" as const),
      nnnRate: st.form.nnnRate || d.nnnRate,
      landlordSignerName: st.form.landlordSignerName || d.landlordSignerName,
      landlordSignerTitle: st.form.landlordSignerTitle || d.landlordSignerTitle,
    };
    if (st.suite?.suiteNumber !== s.suiteNumber) {
      f.nnnRate = d.nnnRate;
      f.tenantLegalName = s.currentTenant || "";
    }
    update({ suite: s, form: recalc(f, undefined, st.touched.securityDeposit), landlordEmail: d.landlordEmail });
  }

  const s = st.suite;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Select the suite</h2>
            <p className="text-sm text-stone-600">
              {info ? (
                <>
                  From <b>{info.fileName}</b> in the Config folder · {info.suites.length} suites
                </>
              ) : (
                "Reading the master suite list from Egnyte…"
              )}
            </p>
          </div>
          {info && (
            <button className="btn-secondary" onClick={() => setShowMap(true)}>
              Column mapping
            </button>
          )}
        </div>

        {err && (
          <div className="mt-4">
            <Alert tone="error">{err}</Alert>
          </div>
        )}
        {info?.warnings.map((w) => (
          <div className="mt-3" key={w}>
            <Alert tone="warn">{w}</Alert>
          </div>
        ))}

        <input
          className="input mt-5 text-base"
          placeholder="Type a suite number or tenant name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {!info && !err && (
          <div className="mt-6 flex items-center gap-2 text-sm text-stone-500">
            <Spinner /> Loading suites…
          </div>
        )}
        <div className="mt-3 max-h-[440px] overflow-auto rounded-lg border border-stone-200">
          {matches.map((m) => (
            <button
              key={m.suiteNumber}
              onClick={() => choose(m)}
              className={`flex w-full items-center justify-between gap-3 border-b border-stone-100 px-4 py-2.5 text-left text-sm hover:bg-brand-50 ${
                s?.suiteNumber === m.suiteNumber ? "bg-brand-50" : ""
              }`}
            >
              <span>
                <span className="font-semibold">Unit {m.suiteNumber}</span>
                <span className="ml-3 text-stone-600">{m.currentTenant || (m.landlordUse ? <i className="text-sky-700">Landlord use · available</i> : <i className="text-emerald-700">Vacant</i>)}</span>
              </span>
              <span className="flex items-center gap-3 text-xs text-stone-500">
                {m.rentableSqFt.toLocaleString()} sf
                <span className={`badge ${m.loadingType === "A" ? "bg-indigo-50 text-indigo-700" : m.loadingType === "B" ? "bg-orange-50 text-orange-700" : "bg-stone-100"}`}>
                  {m.loadingType ? TEMPLATE_LABEL[m.loadingType].code : "?"}
                </span>
              </span>
            </button>
          ))}
          {info && !matches.length && <p className="p-4 text-sm text-stone-500">No suites match “{q}”.</p>}
        </div>
        {s && (
          <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-stone-100 bg-stone-50/60 px-6 py-6 text-center">
            <p className="text-sm text-stone-600">
              <span className="font-semibold text-stone-800">Unit {s.suiteNumber}</span>
              {s.currentTenant ? <> · {s.currentTenant}</> : s.landlordUse ? " · Landlord use, available" : " · Vacant"}
            </p>
            <LeaseViewerButton suite={s.suiteNumber} tenant={s.currentTenant} align="center" />
            <button className="btn-primary w-full max-w-xl py-2.5" onClick={next}>
              Continue to tenant documents →
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Selected suite</h3>
          {!s ? (
            <p className="mt-3 text-sm text-stone-500">Choose a suite to see its details.</p>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              <Row k="Unit" v={s.suiteNumber} />
              <Row k="Street number" v={`${s.streetNumber} Roger B. Chaffee Memorial Blvd. SE`} />
              <Row k="Rentable sq ft" v={s.rentableSqFt.toLocaleString()} />
              <Row k="Proportionate share" v={`${s.proportionateShare}%`} sub={`${s.rentableSqFt.toLocaleString()} ÷ ${info?.defaults.totalBuildingSqFt.toLocaleString()}`} />
              <Row k="Current tenant" v={s.currentTenant || (s.landlordUse ? "None (landlord use, available to lease)" : "Vacant")} />
              {s.comments && <Row k="Comments" v={s.comments} />}
              <div className="border-t border-stone-100 pt-3">
                <dt className="label">Lease template</dt>
                <dd className="mt-1 space-y-2">
                  <TemplateBadge t={st.form.template} large />
                  <div className="flex gap-2 text-xs">
                    {(["A", "B"] as const).map((t) => (
                      <button
                        key={t}
                        className={`rounded border px-2 py-1 ${st.form.template === t ? "border-brand-600 bg-brand-50" : "border-stone-300"}`}
                        onClick={() => update({ form: { ...st.form, template: t } })}
                      >
                        Use {TEMPLATE_LABEL[t].code}
                      </button>
                    ))}
                  </div>
                  {!s.loadingType && <p className="text-xs text-amber-700">Loading type is blank in the sheet — pick a template.</p>}
                  {s.loadingType && s.loadingType !== st.form.template && (
                    <p className="text-xs text-amber-700">Overridden — the sheet says {TEMPLATE_LABEL[s.loadingType].code}.</p>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </div>
        <button className="btn-primary w-full py-2.5" disabled={!s} onClick={next}>
          Continue to tenant documents →
        </button>
      </aside>

      {showMap && info && (
        <MappingModal
          info={info}
          onClose={() => setShowMap(false)}
          onSaved={(i) => {
            setInfo({ ...info, ...i });
            setShowMap(false);
          }}
        />
      )}
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right font-medium">
        {v}
        {sub && <span className="block text-xs font-normal text-stone-400">{sub}</span>}
      </dd>
    </div>
  );
}
