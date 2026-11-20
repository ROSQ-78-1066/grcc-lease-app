"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SigningPanel } from "./Signing";
import { Alert, api, downloadUrl, postJSON, Spinner, TemplateBadge } from "./ui";

interface EnvRef {
  id: string;
  status: "out" | "completed" | "voided";
  waitingOn?: string;
}

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
  loi: { docxPath: string; pdfPath: string | null; signedPath?: string } | null;
  signing: { lease?: EnvRef; loi?: EnvRef };
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
  const [open, setOpen] = useState<Deal | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function del(key: string) {
    setErr("");
    try {
      const r = await api<{ removed: string[] }>(`/api/drafts?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      setNotice(`Deleted ${key}${r.removed.length ? ` (${r.removed.join(", ")} moved to the Egnyte Trash)` : ""}.`);
      setConfirmDel(null);
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

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
  const outForSignature = data?.deals.filter((d) => d.signing?.lease?.status === "out" || d.signing?.loi?.status === "out").length ?? 0;

  const renderStatus = (d: Deal) => (
    <>
                  {d.status === "executed" ? (
                    <span className="badge bg-emerald-100 text-emerald-800">Executed</span>
                  ) : d.signing?.lease?.status === "out" ? (
                    <span className="badge bg-amber-100 text-amber-800" title={d.signing.lease.waitingOn}>
                      Out for signature
                    </span>
                  ) : d.docxPath ? (
                    <span className="badge bg-sky-100 text-sky-800">Draft</span>
                  ) : (
                    <span className="badge bg-violet-100 text-violet-800">LOI stage</span>
                  )}
                  {d.signing?.lease?.status === "out" && <div className="mt-1 text-xs text-stone-500">Waiting on {d.signing.lease.waitingOn}</div>}
                  {d.loi && (
                    <div className="mt-1 text-xs text-stone-500">
                      LOI: {d.loi.signedPath ? "signed" : d.signing?.loi?.status === "out" ? `out — waiting on ${d.signing.loi.waitingOn}` : "drafted"}
                    </div>
                  )}
    </>
  );
  const renderFiles = (d: Deal) => (
    <>
                  {d.docxPath && (
                    <a className="text-brand-600 hover:underline" href={downloadUrl(d.docxPath)}>
                      DOCX
                    </a>
                  )}
                  {d.docxPath && d.pdfPath && (
                    <a className="text-brand-600 hover:underline" href={downloadUrl(d.pdfPath)}>
                      PDF
                    </a>
                  )}
                  {d.loi?.pdfPath && (
                    <a className="text-violet-700 hover:underline" href={downloadUrl(d.loi.signedPath || d.loi.pdfPath)}>
                      {d.loi.signedPath ? "Signed LOI" : "LOI"}
                    </a>
                  )}
                  {d.executedPath && (
                    <a className="font-semibold text-emerald-700 hover:underline" href={downloadUrl(d.executedPath)}>
                      Executed
                    </a>
                  )}
    </>
  );
  const renderActions = (d: Deal) => (
    <>
                  {(d.pdfPath || d.loi?.pdfPath) && (
                    d.status === "executed" ? (
                      <button className="font-semibold text-emerald-700 hover:underline" onClick={() => setOpen(d)} title="Who signed and when, activity and download">
                        Signed ✓
                      </button>
                    ) : (
                      <button className="text-brand-600 hover:underline" onClick={() => setOpen(d)}>
                        Signing
                      </button>
                    )
                  )}
                  {d.status !== "executed" && d.docxPath && d.signing?.lease?.status !== "out" && d.signing?.loi?.status !== "out" && (
                    confirmDel === d.key ? (
                      <span className="ml-3 inline-flex items-center gap-2">
                        <span className="text-xs text-stone-600">Delete draft?</span>
                        <button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => del(d.key)}>
                          Yes, delete
                        </button>
                        <button className="text-xs text-stone-500 hover:underline" onClick={() => setConfirmDel(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button className="ml-3 text-stone-500 hover:text-red-700" onClick={() => setConfirmDel(d.key)}>
                        Delete
                      </button>
                    )
                  )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leases</h1>
          <p className="text-sm text-stone-600">Drafts and LOIs saved to Egnyte, signing status, and executed copies.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={syncing} onClick={runSync}>
            {syncing ? <Spinner /> : "↻"} File signed copies from Draft Leases
          </button>
          <Link href="/new" className="btn-primary">
            + New Lease
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Drafts in progress" value={drafts} />
        <Stat label="Executed" value={executed} />
        <Stat label="Out for signature" value={outForSignature} tone={outForSignature ? "warn" : undefined} />
      </div>

      {err && <Alert tone="error">{err}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {!!data?.signedWaiting.length && (
        <Alert tone="warn">
          {data.signedWaiting.length} signed PDF{data.signedWaiting.length > 1 ? "s" : ""} in Draft Leases can be filed: {data.signedWaiting.join(", ")}. Use “File signed copies”.
        </Alert>
      )}
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

      {/* Phones: one card per deal */}
      <div className="space-y-3 md:hidden">
        {!data && !err && <Spinner className="mx-auto h-5 w-5" />}
        {data?.deals.length === 0 && (
          <div className="card px-4 py-8 text-center text-sm text-stone-500">
            No leases yet. <Link href="/new" className="text-brand-600 underline">Create the first one</Link>.
          </div>
        )}
        {data?.deals.map((d) => (
          <div key={d.key} className="card space-y-3 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">
                  Unit {d.suite} <span className="ml-1 text-xs font-normal text-stone-400">{d.dealType === "renewal" ? "Renewal" : "New"}</span>
                </div>
                <div className="break-words">{d.tenant}</div>
              </div>
              <TemplateBadge t={d.template} />
            </div>
            <div>{renderStatus(d)}</div>
            <div className="text-xs text-stone-500">
              Updated {new Date(d.updatedAt).toLocaleDateString()} · {d.createdBy}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-100 pt-3">
              <span className="space-x-3">{renderFiles(d)}</span>
              <span className="ml-auto">{renderActions(d)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
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
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!data && !err && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone-500">
                  <Spinner className="mx-auto h-5 w-5" />
                </td>
              </tr>
            )}
            {data?.deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-stone-500">
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
                  {renderStatus(d)}
                </td>
                <td className="px-4 py-3 text-stone-500">
                  {new Date(d.updatedAt).toLocaleDateString()} <span className="text-xs">· {d.createdBy}</span>
                </td>
                <td className="space-x-3 px-4 py-3 text-right">
                  {renderFiles(d)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {renderActions(d)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      {open && (
        <SigningModal
          deal={open}
          onClose={() => {
            setOpen(null);
            load();
          }}
        />
      )}
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

function SigningModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-2xl space-y-6 overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Signing — {deal.key}</h2>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {deal.pdfPath && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Lease</h3>
            <SigningPanel dealKey={deal.key} kind="lease" />
          </section>
        )}
        {deal.loi?.pdfPath && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Letter of Intent</h3>
            <SigningPanel dealKey={deal.key} kind="loi" />
          </section>
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
