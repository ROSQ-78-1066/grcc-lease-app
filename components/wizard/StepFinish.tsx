"use client";
import { useEffect, useRef, useState } from "react";
import { missingFields } from "@/lib/lease";
import { Alert, api, downloadUrl, postJSON, Spinner, TemplateBadge } from "../ui";
import type { WizardState } from "./Wizard";

interface GenResult {
  key: string;
  docxPath: string;
  pdfPath: string | null;
  docxLink: string | null;
  pdfLink: string | null;
  folderLink?: string | null;
  warnings: string[];
}

interface Me {
  checks: { email: boolean };
  landlordEmail: string;
  demoMode: boolean;
}

export function StepFinish({ st, back }: { st: WizardState; back: () => void }) {
  const f = st.form;
  const missing = missingFields(f);
  const [res, setRes] = useState<GenResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ver, setVer] = useState(0);
  const [me, setMe] = useState<Me | null>(null);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      setRes(await postJSON<GenResult>("/api/generate", { form: f, allowMissing: true }));
      setVer((v) => v + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function replace(file: File) {
    if (!res) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("key", res.key);
      fd.set("file", file);
      const r = await api<GenResult>("/api/drafts/replace", { method: "POST", body: fd });
      setRes({ ...res, ...r });
      setVer((v) => v + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!res && (
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                Unit {f.suiteNumber} — {f.tenantLegalName || "Tenant"}
              </h2>
              <p className="text-sm text-stone-600">
                {f.dealType === "renewal" ? "Renewal" : "New lease"} · <TemplateBadge t={f.template} />
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={back}>
                ← Edit fields
              </button>
              <button className="btn-primary px-6 py-2.5" disabled={busy} onClick={generate}>
                {busy ? (
                  <>
                    <Spinner /> Building lease…
                  </>
                ) : (
                  "Generate draft & save to Egnyte"
                )}
              </button>
            </div>
          </div>
          {missing.length > 0 && (
            <div className="mt-4">
              <Alert tone="warn">
                These fields are still blank and will print empty: <b>{missing.join(", ")}</b>. You can go back, or generate anyway and finish in Word.
              </Alert>
            </div>
          )}
          <p className="mt-4 text-sm text-stone-500">
            Saves <code>{`Unit ${f.suiteNumber} - ${f.tenantLegalName || "…"} - Draft.docx`}</code> and <code>.pdf</code> to Draft Leases.
          </p>
        </div>
      )}

      {err && <Alert tone="error">{err}</Alert>}

      {res && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2 text-sm">
              <span className="font-medium">{res.key} — Draft</span>
              {busy && <Spinner />}
            </div>
            {res.pdfPath ? (
              <iframe key={ver} title="Draft lease" src={`${downloadUrl(res.pdfPath, true)}&v=${ver}`} className="h-[80vh] w-full bg-stone-100" />
            ) : (
              <div className="p-8 text-sm text-stone-600">PDF preview isn’t available here. Download the Word file to review it.</div>
            )}
          </div>

          <aside className="space-y-4">
            <Alert tone="success">
              Saved to <b>Draft Leases</b> in Egnyte.
              {res.warnings.map((w) => (
                <div key={w} className="mt-1 text-amber-800">
                  {w}
                </div>
              ))}
            </Alert>

            <div className="card space-y-2 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Final edit</h3>
              <div className="grid grid-cols-2 gap-2">
                <a className="btn-secondary" href={downloadUrl(res.docxPath)}>
                  Download .docx
                </a>
                {res.pdfPath ? (
                  <a className="btn-secondary" href={downloadUrl(res.pdfPath)}>
                    Download .pdf
                  </a>
                ) : (
                  <span />
                )}
              </div>
              <button className="btn-secondary w-full" disabled={busy} onClick={() => upload.current?.click()}>
                Upload edited .docx (replaces draft)
              </button>
              <input
                ref={upload}
                type="file"
                accept=".docx"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) replace(file);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={back}>
                  ← Change fields
                </button>
                <button className="btn-ghost flex-1" disabled={busy} onClick={generate}>
                  Regenerate
                </button>
              </div>
            </div>

            <div className="card space-y-3 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Send for signature</h3>
              {res.pdfLink || res.docxLink ? (
                <a className="btn-primary w-full py-3" href={(res.pdfLink || res.docxLink)!} target="_blank" rel="noreferrer">
                  Open File in Egnyte to Send via DocuSign ↗
                </a>
              ) : (
                <Alert tone="info">Egnyte links appear here once the app is connected to Egnyte (demo mode has none).</Alert>
              )}
              <ol className="list-decimal space-y-1 pl-5 text-xs text-stone-600">
                <li>In Egnyte, choose DocuSign → send for signature.</li>
                <li>
                  Add <b>Tenant</b> as signer 1 and <b>Landlord</b> as signer 2 (routing order 1 → 2); guarantors as 3 and 4.
                </li>
                <li>The hidden anchors \s1\ \d1\ (Tenant), \s2\ \d2\ (Landlord), \s3\–\d4\ (Guarantors) place the fields automatically.</li>
              </ol>
            </div>

            <EmailPanel res={res} st={st} me={me} />
          </aside>
        </div>
      )}
    </div>
  );
}

function EmailPanel({ res, st, me }: { res: GenResult; st: WizardState; me: Me | null }) {
  const f = st.form;
  const landlord = me?.landlordEmail || st.landlordEmail;
  const options = [
    { key: "landlord", label: `Landlord (${landlord})`, email: landlord },
    { key: "tenant", label: `Tenant${f.tenantEmail ? ` (${f.tenantEmail})` : " — no email on file"}`, email: f.tenantEmail },
    { key: "broker", label: `Tenant's broker${f.tenantBrokerEmail ? ` (${f.tenantBrokerEmail})` : " — no email on file"}`, email: f.tenantBrokerEmail },
  ];
  const [pick, setPick] = useState<Record<string, boolean>>({ landlord: true });
  const [other, setOther] = useState("");
  const [subject, setSubject] = useState(`Draft Lease for Review – Unit ${f.suiteNumber} – ${f.tenantLegalName}`);
  const [message, setMessage] = useState(
    `Hello,\n\nAttached for your review is the draft lease for ${f.tenantLegalName}, Unit ${f.suiteNumber} (${f.buildingStreetNumber} Roger B. Chaffee Memorial Blvd. SE).\n\nPlease send any comments or changes.\n\nThank you,`,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const to = [...options.filter((o) => pick[o.key] && o.email).map((o) => o.email), ...other.split(/[,;\s]+/).filter((e) => e.includes("@"))];

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      await postJSON("/api/email", { key: res.key, to, subject, message, attach: "pdf" });
      setMsg({ tone: "success", text: `Sent to ${to.join(", ")}` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const mailto = `mailto:${to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  const canSend = me?.checks.email;

  return (
    <div className="card space-y-3 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Email draft for review</h3>
      <div className="space-y-1.5 text-sm">
        {options.map((o) => (
          <label key={o.key} className={`flex items-center gap-2 ${!o.email ? "text-stone-400" : ""}`}>
            <input type="checkbox" className="accent-brand-600" disabled={!o.email} checked={!!pick[o.key] && !!o.email} onChange={(e) => setPick({ ...pick, [o.key]: e.target.checked })} />
            {o.label}
          </label>
        ))}
        <input className="input" placeholder="Other emails (comma separated)" value={other} onChange={(e) => setOther(e.target.value)} />
      </div>
      <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="input min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} />
      {canSend ? (
        <button className="btn-primary w-full" disabled={busy || !to.length} onClick={send}>
          {busy && <Spinner />} Send with PDF attached
        </button>
      ) : (
        <>
          <a className={`btn-primary w-full ${!to.length ? "pointer-events-none opacity-50" : ""}`} href={mailto}>
            Open in my email app
          </a>
          <p className="text-xs text-stone-500">Email sending isn’t set up on the server, so this opens your email app — attach the downloaded PDF.</p>
        </>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
