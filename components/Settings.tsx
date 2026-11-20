"use client";
import { useEffect, useState } from "react";
import { MappingModal, SuitesInfo } from "./MappingModal";
import { Alert, api, postJSON, Section, Spinner } from "./ui";

interface Me {
  user: { username: string; email: string };
  demoMode: boolean;
  egnyteDomain: string;
  root: string;
  folders: Record<string, string>;
  templates: { A: string; B: string };
  model: string;
  checks: { anthropic: boolean; email: boolean; emailProvider: string; serviceToken: boolean; webhookSecret: boolean };
  landlordEmail: string;
  landlordSignerEmail: string;
  propertyManagerEmails: string[];
  token?: string;
}

export function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  const [info, setInfo] = useState<SuitesInfo | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    api<Me>("/api/me").then(setMe).catch((e) => setMsg({ tone: "error", text: e.message }));
  }, []);

  async function openMapping() {
    try {
      setInfo(await api<SuitesInfo>("/api/suites"));
      setShowMap(true);
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  async function registerWebhook() {
    setMsg(null);
    try {
      await postJSON("/api/webhooks/register", {});
      setMsg({ tone: "success", text: "Webhook registered for Draft Leases." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  if (!me) return <Spinner className="h-6 w-6" />;
  const Check = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
    <li className="flex items-start gap-3 py-2">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs text-white ${ok ? "bg-emerald-600" : "bg-stone-400"}`}>{ok ? "✓" : "–"}</span>
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-stone-500">{hint}</span>
      </span>
    </li>
  );

  return (
    <div className="max-w-3xl space-y-6 [overflow-wrap:anywhere]">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {me.demoMode && (
        <Alert tone="warn">
          Demo mode: files are read from and saved to the <code>demo-data</code> folder instead of Egnyte. Set the Egnyte variables in <code>.env</code> to connect.
        </Alert>
      )}

      <Section title="Setup checklist">
        <ul className="divide-y divide-stone-100 text-sm">
          <Check ok={!me.demoMode} label={`Egnyte sign-in (${me.egnyteDomain}.egnyte.com)`} hint="EGNYTE_CLIENT_ID / EGNYTE_CLIENT_SECRET" />
          <Check ok={me.checks.anthropic} label={`AI extraction (${me.model})`} hint="ANTHROPIC_API_KEY" />
          <Check
            ok={me.checks.email}
            label={`Email sending (${me.checks.emailProvider})`}
            hint="EMAIL_PROVIDER + EMAIL_FROM + RESEND_API_KEY (or SMTP_*). Needed for signing links and one-time codes, application alerts, and automatic executed-copy emails. Without it you copy links yourself."
          />
        </ul>
      </Section>

      <Section title="Who gets what">
        <dl className="grid gap-y-1.5 text-sm sm:grid-cols-[220px_1fr]">
          <dt className="text-stone-500">Executed copies (property mgmt.)</dt>
          <dd>{me.propertyManagerEmails.join(", ") || "—"} <span className="text-xs text-stone-400">PROPERTY_MANAGER_EMAILS</span></dd>
          <dt className="text-stone-500">Landlord signer email (default)</dt>
          <dd>{me.landlordSignerEmail || "— (typed when sending)"} <span className="text-xs text-stone-400">LANDLORD_SIGNER_EMAIL</span></dd>
          <dt className="text-stone-500">Landlord on draft-review emails</dt>
          <dd>{me.landlordEmail || "— (not offered)"} <span className="text-xs text-stone-400">LANDLORD_REVIEW_EMAIL</span></dd>
        </dl>
        <p className="mt-2 text-xs text-stone-500">
          A fully signed lease is emailed to every signer, the sender, the tenant’s broker and property management. Signed LOIs are not sent to property management.
        </p>
      </Section>

      <Section title="Egnyte folders">
        <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 text-sm">
          <dt className="text-stone-500">Root</dt>
          <dd className="font-mono text-xs">{me.root}</dd>
          {Object.entries(me.folders)
            .filter(([k]) => k !== "root")
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-stone-500">{k}</dt>
                <dd className="font-mono text-xs">{v}</dd>
              </div>
            ))}
          <dt className="text-stone-500">Lease CD (docks) template</dt>
          <dd className="font-mono text-xs">{me.templates.A}</dd>
          <dt className="text-stone-500">Lease AB (overhead doors) template</dt>
          <dd className="font-mono text-xs">{me.templates.B}</dd>
        </dl>
      </Section>

      <Section title="Master suite list">
        <p className="text-sm text-stone-600">If your Excel headers change, update which column holds each field.</p>
        <button className="btn-secondary mt-3" onClick={openMapping}>
          Edit column mapping
        </button>
      </Section>

      {!me.demoMode && (
        <Section title="Optional: auto-file signed PDFs dropped into Draft Leases">
          <p className="text-sm text-stone-600">
            Leases signed in the app are filed automatically. This optional Egnyte webhook also files signed PDFs that someone saves into Draft Leases by hand (for
            example, a lease signed outside the app). Needs <code>WEBHOOK_AUTH_SECRET</code> and <code>EGNYTE_SERVICE_TOKEN</code> on the server.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={registerWebhook}>
              Register webhook
            </button>
            <button
              className="btn-ghost"
              onClick={async () => setToken((await api<Me>("/api/me?token=1")).token || "")}
            >
              Show my Egnyte token (for EGNYTE_SERVICE_TOKEN)
            </button>
          </div>
          {token && (
            <div className="mt-3">
              <Alert tone="warn">Treat this like a password. Paste it into Render → Environment → EGNYTE_SERVICE_TOKEN.</Alert>
              <input readOnly className="input mt-2 font-mono text-xs" value={token} onFocus={(e) => e.target.select()} />
            </div>
          )}
        </Section>
      )}

      {showMap && info && <MappingModal info={info} onClose={() => setShowMap(false)} onSaved={() => setShowMap(false)} />}
    </div>
  );
}
