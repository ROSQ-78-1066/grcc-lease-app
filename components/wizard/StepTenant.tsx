"use client";
import { LeaseViewerButton } from "../LeaseViewer";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Extracted } from "@/lib/ai";
import { Alert, api, Spinner } from "../ui";
import { applyExtraction } from "./applyExtraction";
import type { WizardState } from "./Wizard";

interface F {
  name: string;
  path: string;
  display: string;
  modified?: string;
  size?: number;
}

const STOP = new Set(["llc", "inc", "co", "corp", "company", "ltd", "the", "and", "of", "l.l.c", "lease", "&"]);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

function score(file: string, tenant: string, suite: string) {
  const n = file.toLowerCase();
  let sc = 0;
  for (const t of tokens(tenant)) if (n.includes(t)) sc += 2;
  for (const u of suite.match(/\d+[a-z]?/gi) || []) if (n.includes(u.toLowerCase())) sc += 3;
  return sc;
}

export function StepTenant({
  st,
  update,
  back,
  next,
}: {
  st: WizardState;
  update: (p: Partial<WizardState>) => void;
  back: () => void;
  next: () => void;
}) {
  const suite = st.suite!;
  const dealType = st.form.dealType;
  const [files, setFiles] = useState<F[] | null>(null);
  const [folder, setFolder] = useState("");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [uploads, setUploads] = useState<File[]>([]);
  const [saveUploads, setSaveUploads] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ filled: string[]; notes: string[] } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFiles(null);
    setSelected([]);
    setErr("");
    api<{ folder: string; files: F[] }>(`/api/files?folder=${dealType === "renewal" ? "currentLeases" : "pendingDeals"}`)
      .then((r) => {
        setFolder(r.folder);
        setFiles(r.files);
        if (dealType === "renewal") {
          const ranked = [...r.files].map((f) => ({ f, s: score(f.display, suite.currentTenant, suite.suiteNumber) })).sort((a, b) => b.s - a.s);
          if (ranked[0]?.s > 0) setSelected([ranked[0].f.path]);
        }
      })
      .catch((e) => setErr(e.message));
  }, [dealType, suite.currentTenant, suite.suiteNumber]);

  const ranked = useMemo(() => {
    if (!files) return [];
    if (dealType !== "renewal") return files;
    return [...files].sort((a, b) => score(b.display, suite.currentTenant, suite.suiteNumber) - score(a.display, suite.currentTenant, suite.suiteNumber));
  }, [files, dealType, suite]);
  const best = dealType === "renewal" && ranked[0] && score(ranked[0].display, suite.currentTenant, suite.suiteNumber) > 0 ? ranked[0].path : null;

  function setDeal(d: "renewal" | "new") {
    const f = { ...st.form, dealType: d };
    if (d === "renewal" && !f.tenantLegalName) f.tenantLegalName = suite.currentTenant;
    if (d === "new" && f.tenantLegalName === suite.currentTenant) f.tenantLegalName = "";
    update({ form: f });
    setResult(null);
  }

  function toggle(p: string) {
    if (dealType === "renewal") setSelected([p]);
    else setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  }

  async function extract() {
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("paths", JSON.stringify(selected));
      fd.set("dealType", dealType);
      fd.set("suiteNumber", suite.suiteNumber);
      fd.set("currentTenant", suite.currentTenant);
      fd.set("saveUploads", String(saveUploads));
      uploads.forEach((u) => fd.append("files", u));
      const r = await api<{ extracted: Extracted; savedUploads: string[] }>("/api/extract", { method: "POST", body: fd });
      const base = { ...st.form };
      if (dealType === "renewal" && !base.tenantLegalName) base.tenantLegalName = suite.currentTenant;
      const out = applyExtraction(base, r.extracted, dealType);
      update({ form: out.form, aiNotes: out.notes });
      setResult({ filled: out.filled, notes: out.notes });
      if (r.savedUploads.length) setUploads([]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setUploads((u) => [...u, ...Array.from(list).filter((f) => /\.(pdf|docx|png|jpe?g|txt)$/i.test(f.name))]);
  }

  const nothingChosen = !selected.length && !uploads.length;

  return (
    <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[1fr_380px]">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Unit {suite.suiteNumber} — what kind of lease?</h2>
          <LeaseViewerButton suite={suite.suiteNumber} tenant={suite.currentTenant} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Choice
            active={dealType === "renewal"}
            disabled={!suite.currentTenant}
            onClick={() => setDeal("renewal")}
            title={suite.currentTenant ? `Renewal for ${suite.currentTenant}` : "Renewal"}
            sub={suite.currentTenant ? "Read the existing lease from Current Leases" : "No current tenant in the master sheet"}
            suggested={!!suite.currentTenant}
          />
          <Choice
            active={dealType === "new"}
            onClick={() => setDeal("new")}
            title="New Tenant"
            sub="Read the LOI and/or Tenant Application"
            suggested={!suite.currentTenant}
          />
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium">{dealType === "renewal" ? "Existing lease to renew" : "LOI / Tenant Application"}</h3>
            <span className="truncate pl-4 text-xs text-stone-500">{folder}</span>
          </div>
          {err && (
            <div className="mt-3">
              <Alert tone="error">{err}</Alert>
            </div>
          )}
          {!files && !err && (
            <div className="mt-3 flex items-center gap-2 text-sm text-stone-500">
              <Spinner /> Loading files from Egnyte…
            </div>
          )}
          {files && (
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-stone-200">
              {!ranked.length && <p className="p-4 text-sm text-stone-500">This folder is empty.</p>}
              {ranked.map((f) => (
                <label key={f.path} className="flex cursor-pointer items-center gap-3 border-b border-stone-100 px-4 py-2.5 text-sm hover:bg-stone-50">
                  <input
                    type={dealType === "renewal" ? "radio" : "checkbox"}
                    name="srcfile"
                    checked={selected.includes(f.path)}
                    onChange={() => toggle(f.path)}
                    className="accent-brand-600"
                  />
                  <span className="min-w-0 flex-1 break-words sm:truncate">{f.display}</span>
                  {f.path === best && <span className="badge bg-emerald-100 text-emerald-800">Suggested match</span>}
                  {f.modified && <span className="hidden text-xs text-stone-400 sm:inline">{new Date(f.modified).toLocaleDateString()}</span>}
                </label>
              ))}
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => input.current?.click()}
            className={`mt-4 cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ${drag ? "border-brand-600 bg-brand-50" : "border-stone-300 text-stone-500"}`}
          >
            Drop a file from your computer here, or click to browse (PDF, DOCX, image)
            <input ref={input} type="file" multiple hidden accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" onChange={(e) => addFiles(e.target.files)} />
          </div>
          {uploads.length > 0 && (
            <div className="mt-2 space-y-1 text-sm">
              {uploads.map((u, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-stone-100 px-3 py-1.5">
                  <span className="truncate">{u.name}</span>
                  <button className="text-xs text-stone-500 hover:text-red-700" onClick={() => setUploads(uploads.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              ))}
              <label className="flex items-center gap-2 pt-1 text-xs text-stone-600">
                <input type="checkbox" className="accent-brand-600" checked={saveUploads} onChange={(e) => setSaveUploads(e.target.checked)} />
                Also save uploaded files to “Pending Deals (LOIs &amp; Applications)” in Egnyte
              </label>
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">AI extraction</h3>
          <p className="mt-2 text-sm text-stone-600">
            Claude reads the selected document{dealType === "new" ? "s" : ""} and pre-fills tenant, dates, rent, escalation, renewal and guarantor
            fields. You review everything in the next step.
          </p>
          <button className="btn-primary mt-4 w-full" disabled={busy || nothingChosen} onClick={extract}>
            {busy ? (
              <>
                <Spinner /> Reading documents…
              </>
            ) : (
              "Extract terms with AI"
            )}
          </button>
          {result && (
            <div className="mt-4 space-y-2">
              <Alert tone="success">
                Filled: {result.filled.length ? result.filled.join(", ") : "nothing found"}
              </Alert>
              {result.notes.map((n, i) => (
                <Alert key={i} tone="warn">
                  {n}
                </Alert>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={back}>
            ← Back
          </button>
          <button className="btn-primary flex-1" onClick={next}>
            {result ? "Review terms →" : "Skip — enter manually →"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function Choice({ active, disabled, onClick, title, sub, suggested }: { active: boolean; disabled?: boolean; onClick: () => void; title: string; sub: string; suggested?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition disabled:opacity-40 ${active ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-stone-200 hover:border-stone-400"}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        {suggested && <span className="badge bg-brand-100 text-brand-700">Suggested</span>}
      </span>
      <span className="mt-1 block text-sm text-stone-600">{sub}</span>
    </button>
  );
}
