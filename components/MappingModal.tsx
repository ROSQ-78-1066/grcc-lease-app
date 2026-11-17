"use client";
import { useState } from "react";
import { Alert, Field, postJSON, Spinner } from "./ui";

export interface Mapping {
  sheet?: string;
  suite: string;
  tenant: string;
  sqft: string;
  loadingType: string;
  streetNumber?: string;
  share?: string;
  comments?: string;
}

export interface SuitesInfo {
  fileName: string;
  sheets: string[];
  headers: string[];
  headerRow: number;
  mapping: Mapping;
  mappingSaved: boolean;
  warnings: string[];
  suites: import("@/lib/lease").Suite[];
}

const FIELDS: { k: keyof Mapping; label: string; required?: boolean; hint?: string }[] = [
  { k: "suite", label: "Suite / Unit number", required: true },
  { k: "tenant", label: "Current tenant", required: true },
  { k: "sqft", label: "Rentable sq ft", required: true },
  { k: "loadingType", label: "Lease type (AB/CD, or old A/B)", required: true },
  { k: "streetNumber", label: "Building street number", hint: "Leave blank to use the first number of the suite (e.g. 3506)." },
  { k: "comments", label: "Comments" },
];

export function MappingModal({ info, onClose, onSaved }: { info: SuitesInfo; onClose: () => void; onSaved: (i: SuitesInfo) => void }) {
  const [m, setM] = useState<Mapping>(info.mapping);
  const [preview, setPreview] = useState<SuitesInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(save: boolean) {
    setBusy(true);
    setErr("");
    try {
      const r = await postJSON<SuitesInfo>("/api/suites", { mapping: m, save });
      if (save) onSaved(r);
      else setPreview(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Column mapping</h2>
        <p className="mt-1 text-sm text-stone-600">
          Match the columns in <b>{info.fileName}</b> (headers found on row {info.headerRow}) to the fields the app needs. Saved to the
          Config folder for everyone.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {info.sheets.length > 1 && (
            <Field label="Sheet">
              <select className="input" value={m.sheet || ""} onChange={(e) => setM({ ...m, sheet: e.target.value || undefined })}>
                <option value="">First sheet</option>
                {info.sheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          )}
          {FIELDS.map((f) => (
            <Field key={f.k} label={f.label + (f.required ? " *" : "")} hint={f.hint}>
              <select className="input" value={(m[f.k] as string) || ""} onChange={(e) => setM({ ...m, [f.k]: e.target.value })}>
                <option value="">{f.required ? "— choose —" : "— none —"}</option>
                {info.headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        {err && <div className="mt-4"><Alert tone="error">{err}</Alert></div>}
        {preview && (
          <div className="mt-4 text-sm">
            <Alert tone={preview.warnings.length ? "warn" : "success"}>
              {preview.suites.length} suites found.
              {preview.warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </Alert>
            <div className="mt-2 max-h-40 overflow-auto rounded border border-stone-200 text-xs">
              {preview.suites.slice(0, 8).map((s) => (
                <div key={s.suiteNumber} className="flex justify-between border-b border-stone-100 px-3 py-1.5">
                  <span>
                    {s.suiteNumber} · {s.currentTenant || (s.landlordUse ? "Landlord use" : "Vacant")}
                  </span>
                  <span>
                    {s.rentableSqFt.toLocaleString()} sf · {s.loadingType ?? "?"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => run(false)}>
            Preview
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => run(true)}>
            {busy && <Spinner />} Save mapping
          </button>
        </div>
      </div>
    </div>
  );
}
