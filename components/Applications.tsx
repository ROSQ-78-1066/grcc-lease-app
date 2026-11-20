"use client";
import { useCallback, useEffect, useState } from "react";
import type { Suite } from "@/lib/lease";
import { Alert, api, Field, postJSON, Section, Spinner } from "./ui";

interface Link {
  id: string;
  createdAt: string;
  createdBy: string;
  suite: string;
  prospect: string;
  prospectEmail: string;
  expiresAt: string;
  status: "active" | "revoked";
  closedReason: string | null;
  url: string | null;
  submissions: { at: string; businessName: string; files: string[]; folder: string; folderLink: string | null }[];
}
interface Data {
  emailEnabled: boolean;
  limits: { maxFiles: number; maxFileMb: number; maxTotalMb: number; maxSubmissions: number };
  links: Link[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

export function Applications() {
  const [data, setData] = useState<Data | null>(null);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [form, setForm] = useState({ suite: "", prospect: "", prospectEmail: "", days: 14 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string; url?: string } | null>(null);

  const load = useCallback(() => {
    api<Data>("/api/applications")
      .then(setData)
      .catch((e) => setMsg({ tone: "error", text: e.message }));
  }, []);
  useEffect(() => {
    load();
    api<{ suites: Suite[] }>("/api/suites")
      .then((d) => setSuites(d.suites))
      .catch(() => {});
  }, [load]);

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const s = suites.find((x) => x.suiteNumber === form.suite);
      const r = await postJSON<{ url: string; emailed: boolean }>("/api/applications", { ...form, streetNumber: s?.streetNumber || "" });
      setMsg({
        tone: "success",
        text: r.emailed ? `Link created and emailed to ${form.prospectEmail}.` : "Link created. Copy it and send it to the prospect.",
        url: r.url,
      });
      setForm({ suite: "", prospect: "", prospectEmail: "", days: 14 });
      load();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await postJSON(`/api/applications/${id}`, { action: "revoke" }).catch((e) => setMsg({ tone: "error", text: e.message }));
    load();
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tenant applications</h1>
        <p className="text-sm text-stone-600">
          Send a prospect a private link to the application form. Their answers and files are saved to <b>PENDING Deals</b> in Egnyte, and you get an email for
          every submission.
        </p>
      </div>
      {msg && (
        <Alert tone={msg.tone}>
          {msg.text}
          {msg.url && <CopyBox url={msg.url} />}
        </Alert>
      )}

      <Section title="New application link">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Suite (optional)">
            <select className="input" value={form.suite} onChange={(e) => setForm({ ...form, suite: e.target.value })}>
              <option value="">Any / not decided</option>
              {suites.map((s) => (
                <option key={s.suiteNumber} value={s.suiteNumber}>
                  {s.suiteNumber}
                  {s.currentTenant ? ` — ${s.currentTenant}` : " — vacant"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prospect name">
            <input className="input" value={form.prospect} onChange={(e) => setForm({ ...form, prospect: e.target.value })} />
          </Field>
          <Field label="Prospect email" hint={data?.emailEnabled ? "We’ll email them the link" : "Email isn’t set up — you’ll copy the link"}>
            <input className="input" type="email" value={form.prospectEmail} onChange={(e) => setForm({ ...form, prospectEmail: e.target.value })} />
          </Field>
          <Field label="Link expires after (days)">
            <input className="input" type="number" min={1} max={60} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) || 14 })} />
          </Field>
        </div>
        <button className="btn-primary mt-4" disabled={busy} onClick={create}>
          {busy && <Spinner />} Email link
        </button>
        {data && (
          <p className="mt-3 text-xs text-stone-500">
            Uploads: PDF, Word and images only; up to {data.limits.maxFiles} files, {data.limits.maxFileMb} MB each, {data.limits.maxTotalMb} MB per submission;{" "}
            {data.limits.maxSubmissions} submissions per link.
          </p>
        )}
      </Section>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Prospect</th>
              <th className="px-4 py-3">Suite</th>
              <th className="px-4 py-3">Link</th>
              <th className="px-4 py-3">Submissions</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={4} className="px-4 py-8">
                  <Spinner className="mx-auto h-5 w-5" />
                </td>
              </tr>
            )}
            {data?.links.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-500">
                  No application links yet.
                </td>
              </tr>
            )}
            {data?.links.map((l) => (
              <tr key={l.id} className="border-t border-stone-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{l.prospect || "—"}</div>
                  <div className="text-xs text-stone-500">{l.prospectEmail}</div>
                  <div className="text-xs text-stone-400">
                    {day(l.createdAt)} · {l.createdBy}
                  </div>
                </td>
                <td className="px-4 py-3">{l.suite || "Any"}</td>
                <td className="px-4 py-3">
                  {l.url ? (
                    <>
                      <span className="badge bg-emerald-100 text-emerald-800">Open until {day(l.expiresAt)}</span>
                      <CopyBox url={l.url} />
                      <button className="mt-1 text-xs text-red-700 hover:underline" onClick={() => revoke(l.id)}>
                        Turn off link
                      </button>
                    </>
                  ) : (
                    <span className="badge bg-stone-100 text-stone-600">{l.status === "revoked" ? "Turned off" : "Closed"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {l.submissions.length === 0 && <span className="text-stone-400">None yet</span>}
                  {l.submissions.map((s, i) => (
                    <div key={i} className="mb-2">
                      <div className="font-medium">{s.businessName}</div>
                      <div className="text-xs text-stone-500">
                        {new Date(s.at).toLocaleString()} · {s.files.length} file{s.files.length === 1 ? "" : "s"}
                      </div>
                      {s.folderLink && (
                        <a className="text-xs text-brand-600 hover:underline" href={s.folderLink} target="_blank" rel="noreferrer">
                          Open folder in Egnyte ↗
                        </a>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex max-w-md gap-2">
      <input readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.target.select()} />
      <button
        className="btn-secondary shrink-0"
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
