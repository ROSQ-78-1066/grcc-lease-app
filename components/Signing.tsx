"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, api, downloadUrl, postJSON, Spinner } from "./ui";

type Role = "tenant" | "guarantor" | "landlord";
interface SignerIn {
  role: Role;
  anchor: number;
  name: string;
  email: string;
}
interface Status {
  emailEnabled: boolean;
  hasPdf: boolean;
  defaults: SignerIn[];
  individualTenant: boolean;
  envelope: null | {
    id: string;
    status: "out" | "completed" | "voided";
    title: string;
    sentAt: string;
    completedAt?: string;
    finalPath?: string;
    current: number;
    signers: { role: Role; name: string; email: string; status: string; signedAt?: string; viewedAt?: string; method?: string }[];
    currentLink: string | null;
    events: { at: string; event: string }[];
  };
}

const ROLE: Record<Role, string> = { tenant: "Tenant", guarantor: "Guarantor", landlord: "Landlord" };
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

/** "Send for signature" — the app's built-in signing (replaces the DocuSign handoff). */
export function SigningPanel({ dealKey, kind, refreshKey = 0, onChange }: { dealKey: string; kind: "lease" | "loi"; refreshKey?: number; onChange?: () => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [signers, setSigners] = useState<SignerIn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<Status>(`/api/signing?key=${encodeURIComponent(dealKey)}&kind=${kind}`)
      .then((s) => {
        setSt(s);
        setSigners(s.defaults);
      })
      .catch((e) => setErr(e.message));
  }, [dealKey, kind]);
  useEffect(load, [load, refreshKey]);

  async function send() {
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const r = await postJSON<{ link: string; emailed: boolean; firstSigner: string }>("/api/signing", { key: dealKey, kind, signers, message });
      setNote(r.emailed ? `Sent. ${r.firstSigner} has been emailed a private signing link.` : `Created. Email isn’t set up yet, so copy ${r.firstSigner}’s link below and send it yourself.`);
      load();
      onChange?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "resend" | "void") {
    if (!st?.envelope) return;
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const r = await postJSON<{ emailed?: boolean }>(`/api/signing/${st.envelope.id}`, { action });
      setNote(action === "void" ? "Signing cancelled. You can edit the draft and send it again." : r.emailed ? "Link emailed again." : "Email isn’t set up; copy the link below.");
      setConfirmVoid(false);
      load();
      onChange?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!st) return err ? <Alert tone="error">{err}</Alert> : <Spinner />;
  const env = st.envelope;
  const label = kind === "lease" ? "lease" : "LOI";

  return (
    <div className="space-y-3">
      {err && <Alert tone="error">{err}</Alert>}
      {note && <Alert tone="success">{note}</Alert>}

      {env && env.status !== "voided" ? (
        <>
          <div className="text-sm">
            {env.status === "completed" ? (
              <span className="badge bg-emerald-100 text-emerald-800">Completed {when(env.completedAt)}</span>
            ) : (
              <span className="badge bg-amber-100 text-amber-800">Out for signature · sent {when(env.sentAt)}</span>
            )}
          </div>
          <ol className="space-y-1.5 text-sm">
            {env.signers.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
                    s.status === "signed" ? "bg-emerald-600" : i === env.current && env.status === "out" ? "bg-amber-500" : "bg-stone-300"
                  }`}
                >
                  {s.status === "signed" ? "✓" : i + 1}
                </span>
                <span>
                  <b>{ROLE[s.role]}</b> · {s.name} <span className="text-stone-500">{s.email}</span>
                  <span className="block text-xs text-stone-500">
                    {s.status === "signed"
                      ? `Signed ${when(s.signedAt)}${s.method === "ink" ? " (ink copy uploaded)" : ""}`
                      : i === env.current && env.status === "out"
                        ? s.viewedAt
                          ? `Opened ${when(s.viewedAt)} — waiting to sign`
                          : "Link sent — not opened yet"
                        : "Waiting for earlier signers"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {env.status === "out" && env.currentLink && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input readOnly className="input font-mono text-xs" value={env.currentLink} onFocus={(e) => e.target.select()} />
                <button
                  className="btn-secondary shrink-0"
                  onClick={() => {
                    navigator.clipboard?.writeText(env.currentLink!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-stone-500">Private link for {env.signers[env.current].name}. Don’t share it with anyone else.</p>
              <div className="flex flex-wrap gap-2">
                {st.emailEnabled && (
                  <button className="btn-secondary" disabled={busy} onClick={() => act("resend")}>
                    Email link again
                  </button>
                )}
                {!confirmVoid ? (
                  <button className="btn-ghost text-red-700" disabled={busy} onClick={() => setConfirmVoid(true)}>
                    Cancel signing…
                  </button>
                ) : (
                  <span className="flex items-center gap-2 text-sm">
                    Cancel this envelope? Signatures so far are discarded.
                    <button className="btn-secondary text-red-700" disabled={busy} onClick={() => act("void")}>
                      Yes, cancel
                    </button>
                    <button className="btn-ghost" onClick={() => setConfirmVoid(false)}>
                      No
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
          {env.status === "completed" && env.finalPath && (
            <a className="btn-primary w-full" href={downloadUrl(env.finalPath)}>
              Download signed {label}
            </a>
          )}
          <details className="text-xs text-stone-500">
            <summary className="cursor-pointer">Activity</summary>
            <ul className="mt-1 space-y-0.5">
              {env.events.map((e, i) => (
                <li key={i}>
                  {when(e.at)} — {e.event}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <>
          {env?.status === "voided" && <p className="text-xs text-stone-500">The last envelope was cancelled. You can send again.</p>}
          {!st.hasPdf && <Alert tone="warn">Generate the {label} PDF first.</Alert>}
          <p className="text-xs text-stone-600">
            Signing order: Tenant{kind === "lease" && signers.some((s) => s.role === "guarantor") ? " → Guarantor(s)" : ""} → Landlord countersigns last. Each signer gets a
            private link{st.emailEnabled ? " by email and a one-time code to open it" : ""}.
          </p>
          <div className="space-y-2">
            {signers.map((s, i) => (
              <div key={`${s.role}${s.anchor}`} className="grid grid-cols-[84px_1fr_1fr] items-center gap-2">
                <span className="text-xs font-semibold uppercase text-stone-500">{ROLE[s.role]}</span>
                <input className="input" placeholder="Name" value={s.name} onChange={(e) => setSigners(signers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input
                  className="input"
                  placeholder={st.emailEnabled ? "Email (required)" : "Email"}
                  type="email"
                  value={s.email}
                  onChange={(e) => setSigners(signers.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                />
              </div>
            ))}
          </div>
          <textarea className="input min-h-16" placeholder="Optional note to the signers" value={message} onChange={(e) => setMessage(e.target.value)} />
          {kind === "lease" && st.individualTenant && (
            <p className="text-xs text-amber-800">Exhibit A must be notarized. The tenant can upload the notarized page when signing.</p>
          )}
          {!st.emailEnabled && (
            <p className="text-xs text-stone-500">Email sending isn’t set up yet: you’ll copy each signer’s link and send it yourself, and signers won’t get an email code.</p>
          )}
          <button className="btn-primary w-full py-3" disabled={busy || !st.hasPdf} onClick={send}>
            {busy && <Spinner />} Send {label} for signature
          </button>
        </>
      )}
    </div>
  );
}
