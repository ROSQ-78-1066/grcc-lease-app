"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Spinner } from "../ui";
import { PublicShell } from "./PublicShell";

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "date" | "number" | "textarea" | "select" | "yesno";
  options?: string[];
}
interface Info {
  closed: string | null;
  suite: string;
  streetNumber: string;
  prospect: string;
  prospectEmail: string;
  broker: string;
  expiresAt: string;
  fields: { section: string; fields: FieldDef[] }[];
  certify: string;
  limits: { maxFiles: number; maxFileMb: number; maxTotalMb: number; accept: string };
}

export function ApplyClient({ token }: { token: string }) {
  const url = `/api/apply/${token}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [certify, setCertify] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(url)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "This link isn’t valid.");
        setInfo(j);
        setVals({ suite: j.suite || "", businessName: j.prospect || "", email: j.prospectEmail || "" });
      })
      .catch((e) => setErr(e.message));
  }, [url]);

  const set = (k: string, v: string) => setVals((p) => ({ ...p, [k]: v }));
  const totalMb = files.reduce((a, f) => a + f.size, 0) / 1024 / 1024;

  function addFiles(list: FileList | null) {
    if (!list || !info) return;
    const ok = /\.(pdf|docx?|jpe?g|png|hei[cf])$/i;
    const next = [...files];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      if (!ok.test(f.name)) problems.push(`${f.name}: only PDF, Word and image files`);
      else if (f.size > info.limits.maxFileMb * 1024 * 1024) problems.push(`${f.name}: larger than ${info.limits.maxFileMb} MB`);
      else next.push(f);
    }
    setFiles(next.slice(0, info.limits.maxFiles));
    setErr(problems.join("; "));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    if (totalMb > info.limits.maxTotalMb) return setErr(`Files total more than ${info.limits.maxTotalMb} MB.`);
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(vals)) fd.set(k, v);
      fd.set("certify", certify ? "1" : "");
      fd.set("signedName", signedName);
      for (const f of files) fd.append("files", f);
      const r = await fetch(url, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Upload failed (${r.status})`);
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!info)
    return (
      <PublicShell title="Tenant application">{err ? <Alert tone="error">{err}</Alert> : <Spinner className="h-6 w-6" />}</PublicShell>
    );
  if (info.closed)
    return (
      <PublicShell title="Tenant application">
        <Alert tone="warn">{info.closed}</Alert>
      </PublicShell>
    );
  if (done)
    return (
      <PublicShell title="Tenant application">
        <Alert tone="success">
          Thank you — your application{files.length ? ` and ${files.length} file${files.length > 1 ? "s" : ""}` : ""} were received. {info.broker} will be in touch.
        </Alert>
      </PublicShell>
    );

  return (
    <PublicShell title="Tenant application">
      <h1 className="text-2xl font-semibold">Tenant application{info.suite ? ` — Suite ${info.suite}` : ""}</h1>
      <p className="mt-1 text-sm text-stone-600">
        {info.streetNumber ? `${info.streetNumber} ` : ""}Roger B. Chaffee Memorial Blvd. SE, Wyoming, MI. Sent by {info.broker}. This link expires{" "}
        {new Date(info.expiresAt).toLocaleDateString(undefined, { dateStyle: "long" })}.
      </p>

      <form className="mt-6 space-y-6" onSubmit={submit}>
        {info.fields.map((s) => (
          <section key={s.section} className="card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-700">{s.section}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {s.fields.map((f) => (
                <label key={f.key} className={`block ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
                  <span className="label">
                    {f.label}
                    {f.required && <span className="text-red-600"> *</span>}
                  </span>
                  {f.type === "textarea" ? (
                    <textarea className="input min-h-20" required={f.required} value={vals[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} />
                  ) : f.type === "select" ? (
                    <select className="input" required={f.required} value={vals[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">Choose…</option>
                      {f.options!.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.type === "yesno" ? (
                    <select className="input" value={vals[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">Choose…</option>
                      <option>No</option>
                      <option>Yes</option>
                    </select>
                  ) : (
                    <input className="input" type={f.type || "text"} required={f.required} value={vals[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} />
                  )}
                </label>
              ))}
            </div>
          </section>
        ))}

        <section className="card p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-stone-700">Documents</h2>
          <p className="mb-3 text-sm text-stone-600">
            Financial statements, tax returns, articles of organization, a signed LOI, photo ID of guarantors, etc. PDF, Word (.doc, .docx) or images (.jpg, .png,
            .heic) — up to {info.limits.maxFiles} files, {info.limits.maxFileMb} MB each, {info.limits.maxTotalMb} MB total.
          </p>
          <div
            className="grid place-items-center rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-600"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            <p>Drag files here, or</p>
            <button type="button" className="btn-secondary mt-2" onClick={() => fileInput.current?.click()}>
              Choose files…
            </button>
            <input ref={fileInput} type="file" multiple hidden accept={info.limits.accept} onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          </div>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="truncate">
                    {f.name} <span className="text-xs text-stone-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  </span>
                  <button type="button" className="text-xs text-stone-500 hover:text-red-700" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </li>
              ))}
              <li className={`text-xs ${totalMb > info.limits.maxTotalMb ? "text-red-700" : "text-stone-500"}`}>
                Total {totalMb.toFixed(1)} MB of {info.limits.maxTotalMb} MB
              </li>
            </ul>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <label className="flex gap-3 text-sm">
            <input type="checkbox" className="mt-1 accent-brand-600" checked={certify} onChange={(e) => setCertify(e.target.checked)} />
            <span>{info.certify}</span>
          </label>
          <label className="block max-w-sm">
            <span className="label">Type your full name to sign *</span>
            <input className="input" required value={signedName} onChange={(e) => setSignedName(e.target.value)} />
          </label>
          {err && <Alert tone="error">{err}</Alert>}
          <button className="btn-primary px-8 py-3" disabled={busy || !certify || !signedName.trim()}>
            {busy ? (
              <>
                <Spinner /> Uploading…
              </>
            ) : (
              "Submit application"
            )}
          </button>
        </section>
      </form>
    </PublicShell>
  );
}
