"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, api, downloadUrl, postJSON, Spinner, TemplateBadge } from "./ui";

interface Deal {
  key: string;
  suite: string;
  tenant: string;
  template: "A" | "B";
  dealType: "renewal" | "new";
  status: "draft" | "executed";
  updatedAt: string;
  createdBy: string;
  docxPath: string;
  pdfPath: string | null;
  executedPath?: string;
}
interface Data {
  deals: Deal[];
  signedWaiting: string[];
  draftsFolderLink: string | null;
  executedFolderLink: string | null;
}
interface SyncResult {
  filed: { deal: string; to: string; emailed: string[] }[];
  skipped: { file: string; reason: string }[];
  errors: string[];
}

export function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncResult | null>(null);

  const load = useCallback(() => {
    api<Data>("/api/drafts")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  async function runSync() {
    setSyncing(true);
    setSync(null);
    try {
      setSync(await postJSON<SyncResult>("/api/sync", {}));
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const drafts = data?.deals.filter((d) => d.status === "draft").length ?? 0;
  const executed = data?.deals.filter((d) => d.status === "executed").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leases</h1>
          <p className="text-sm text-stone-600">Drafts saved to Egnyte and executed copies filed from DocuSign.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={syncing} onClick={runSync}>
            {syncing ? <Spinner /> : "↻"} Sync / File Executed Copy
          </button>
          <Link href="/new" className="btn-primary">
            + New Lease
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Drafts in progress" value={drafts} />
        <Stat label="Executed" value={executed} />
        <Stat label="Signed copies waiting to be filed" value={data?.signedWaiting.length ?? 0} tone={data?.signedWaiting.length ? "warn" : undefined} />
      </div>

      {err && <Alert tone="error">{err}</Alert>}
      {sync && (
        <Alert tone={sync.errors.length ? "warn" : "success"}>
          {sync.filed.length === 0 && sync.errors.length === 0 && "No new signed copies found in Draft Leases."}
          {sync.filed.map((f) => (
            <div key={f.to}>
              ✓ Filed <b>{f.deal} - EXECUTED.pdf</b>
              {f.emailed.length ? ` and emailed ${f.emailed.join(", ")}` : ""}
            </div>
          ))}
          {sync.errors.map((e) => (
            <div key={e} className="text-red-800">
              {e}
            </div>
          ))}
        </Alert>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Files</th>
            </tr>
          </thead>
          <tbody>
            {!data && !err && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                  <Spinner className="mx-auto h-5 w-5" />
                </td>
              </tr>
            )}
            {data?.deals.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  No leases yet. <Link href="/new" className="text-brand-600 underline">Create the first one</Link>.
                </td>
              </tr>
            )}
            {data?.deals.map((d) => (
              <tr key={d.key} className="border-t border-stone-100">
                <td className="px-4 py-3 font-semibold">{d.suite}</td>
                <td className="px-4 py-3">
                  {d.tenant}
                  <span className="ml-2 text-xs text-stone-400">{d.dealType === "renewal" ? "Renewal" : "New"}</span>
                </td>
                <td className="px-4 py-3">
                  <TemplateBadge t={d.template} />
                </td>
                <td className="px-4 py-3">
                  {d.status === "executed" ? (
                    <span className="badge bg-emerald-100 text-emerald-800">Executed</span>
                  ) : (
                    <span className="badge bg-sky-100 text-sky-800">Draft</span>
                  )}
                </td>
                <td className="px-4 py-3 text-stone-500">
                  {new Date(d.updatedAt).toLocaleDateString()} <span className="text-xs">· {d.createdBy}</span>
                </td>
                <td className="space-x-3 px-4 py-3 text-right">
                  <a className="text-brand-600 hover:underline" href={downloadUrl(d.docxPath)}>
                    DOCX
                  </a>
                  {d.pdfPath && (
                    <a className="text-brand-600 hover:underline" href={downloadUrl(d.pdfPath)}>
                      PDF
                    </a>
                  )}
                  {d.executedPath && (
                    <a className="font-semibold text-emerald-700 hover:underline" href={downloadUrl(d.executedPath)}>
                      Executed
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 text-sm">
        {data?.draftsFolderLink && (
          <a className="text-brand-600 hover:underline" href={data.draftsFolderLink} target="_blank" rel="noreferrer">
            Open Draft Leases in Egnyte ↗
          </a>
        )}
        {data?.executedFolderLink && (
          <a className="text-brand-600 hover:underline" href={data.executedFolderLink} target="_blank" rel="noreferrer">
            Open Executed New Leases in Egnyte ↗
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`card p-5 ${tone === "warn" ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-stone-600">{label}</div>
    </div>
  );
}
