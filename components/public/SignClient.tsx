"use client";
import "@fontsource/dancing-script/600.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Spinner } from "../ui";
import { PublicShell } from "./PublicShell";

interface View {
  title: string;
  kind: "lease" | "loi";
  status: "out" | "completed" | "voided";
  sentBy: string;
  message: string;
  me: { name: string; role: string; roleLabel: string; status: string; emailMasked: string; consented: boolean };
  myTurn: boolean;
  waitingOn: string | null;
  order: { label: string; status: string }[];
  initialsNeeded: boolean;
  pages: number;
  verified: boolean;
  codeRequired: boolean;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}

/** Crop a drawn signature to its ink so it fills the signature line. */
function trimmedPng(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return c.toDataURL("image/png");
  const pad = 6;
  const out = document.createElement("canvas");
  out.width = Math.min(w, x1 - x0 + pad * 2);
  out.height = Math.min(h, y1 - y0 + pad * 2);
  out.getContext("2d")!.drawImage(c, Math.max(0, x0 - pad), Math.max(0, y0 - pad), out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 4);

export function SignClient({ token }: { token: string }) {
  const base = `/api/sign/${token}`;
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { all: boolean }>(null);

  const load = useCallback(() => {
    call<View>(base)
      .then(setV)
      .catch((e) => setErr(e.message));
  }, [base]);
  useEffect(load, [load]);

  if (err && !v)
    return (
      <PublicShell title="Document signing">
        <Alert tone="error">{err}</Alert>
      </PublicShell>
    );
  if (!v)
    return (
      <PublicShell title="Document signing">
        <Spinner className="h-6 w-6" />
      </PublicShell>
    );

  return (
    <PublicShell title="Document signing">
      <h1 className="text-2xl font-semibold">{v.title}</h1>
      <p className="mt-1 text-sm text-stone-600">
        Sent by {v.sentBy} to <b>{v.me.name}</b> ({v.me.roleLabel})
      </p>
      <Progress order={v.order} />

      {done ? (
        <div className="mt-6 space-y-3">
          <Alert tone="success">
            {done.all
              ? "Thank you — everyone has now signed. A completed copy has been filed and emailed to all parties."
              : "Thank you — you’ve signed. The next signer has been notified. You’ll receive the completed copy by email when everyone has signed."}
          </Alert>
          {done.all && (
            <a className="btn-primary" href={`${base}/pdf?download=1`}>
              Download the completed copy
            </a>
          )}
        </div>
      ) : v.status === "completed" ? (
        <div className="mt-6 space-y-3">
          <Alert tone="success">Everyone has signed this document.</Alert>
          {v.verified ? (
            <a className="btn-primary" href={`${base}/pdf?download=1`}>
              Download the completed copy
            </a>
          ) : (
            <CodeGate base={base} v={v} onVerified={load} />
          )}
        </div>
      ) : v.me.status === "signed" ? (
        <div className="mt-6">
          <Alert tone="success">You’ve already signed. {v.waitingOn ? `Waiting on ${v.waitingOn}.` : ""} You’ll get the completed copy by email.</Alert>
        </div>
      ) : !v.myTurn ? (
        <div className="mt-6">
          <Alert tone="info">It isn’t your turn yet — this document is waiting on {v.waitingOn}. You’ll get an email when it’s ready for you.</Alert>
        </div>
      ) : !v.verified ? (
        <CodeGate base={base} v={v} onVerified={load} />
      ) : (
        <SignForm
          base={base}
          v={v}
          onDone={(all) => {
            setDone({ all });
            load();
          }}
        />
      )}
    </PublicShell>
  );
}

function Progress({ order }: { order: { label: string; status: string }[] }) {
  return (
    <ol className="mt-4 flex flex-wrap gap-2 text-xs">
      {order.map((o, i) => (
        <li key={i} className={`badge ${o.status === "signed" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
          {o.status === "signed" ? "✓" : i + 1}. {o.label}
        </li>
      ))}
    </ol>
  );
}

function CodeGate({ base, v, onVerified }: { base: string; v: View; onVerified: () => void }) {
  const [sent, setSent] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    setBusy(true);
    setErr("");
    try {
      const r = await call<{ sentTo: string }>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "code" }) });
      setSent(r.sentTo);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setErr("");
    try {
      await call(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", code }) });
      onVerified();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card mt-6 max-w-md space-y-3 p-6">
      <h2 className="font-semibold">Confirm it’s you</h2>
      <p className="text-sm text-stone-600">We’ll email a 6-digit code to {v.me.emailMasked}.</p>
      {err && <Alert tone="error">{err}</Alert>}
      {!sent ? (
        <button className="btn-primary" disabled={busy} onClick={send}>
          {busy && <Spinner />} Email me a code
        </button>
      ) : (
        <>
          <p className="text-sm text-stone-600">Code sent to {sent}. It expires in 10 minutes.</p>
          <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || code.length !== 6} onClick={verify}>
              {busy && <Spinner />} Continue
            </button>
            <button className="btn-ghost" disabled={busy} onClick={send}>
              Send a new code
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SignForm({ base, v, onDone }: { base: string; v: View; onDone: (all: boolean) => void }) {
  const [consent, setConsent] = useState(v.me.consented);
  const [mode, setMode] = useState<"typed" | "drawn" | "ink">("typed");
  const [typed, setTyped] = useState(v.me.name);
  const [initials, setInitials] = useState(initialsOf(v.me.name));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const draw = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function agree(checked: boolean) {
    setConsent(checked);
    if (checked) await call(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent" }) }).catch(() => {});
  }

  async function typedPng(): Promise<string> {
    await document.fonts.load("600 64px 'Dancing Script'");
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = "600 64px 'Dancing Script'";
    const w = Math.ceil(ctx.measureText(typed).width) + 24;
    c.width = Math.max(w, 120);
    c.height = 96;
    ctx.font = "600 64px 'Dancing Script'";
    ctx.fillStyle = "#0b1f5c";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(typed, 12, 70);
    return c.toDataURL("image/png");
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("consent", consent ? "1" : "");
      fd.set("method", mode);
      fd.set("initials", initials);
      if (mode === "typed") {
        if (!typed.trim()) throw new Error("Type your name to sign.");
        fd.set("signature", await typedPng());
      } else if (mode === "drawn") {
        if (!drawn) throw new Error("Draw your signature in the box.");
        fd.set("signature", trimmedPng(draw.current!));
      } else if (!files.length) throw new Error("Upload your signed copy.");
      for (const f of files) fd.append("files", f);
      const r = await call<{ done: boolean }>(`${base}/submit`, { method: "POST", body: fd });
      onDone(r.done);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2 text-sm">
          <span>
            Document · {v.pages} pages {v.initialsNeeded && mode !== "ink" ? "· initials go in each page footer" : ""}
          </span>
          <a className="text-brand-600 hover:underline" href={`${base}/pdf?download=1`}>
            Download / print
          </a>
        </div>
        <iframe title="Document" src={`${base}/pdf`} className="h-[75vh] w-full bg-stone-100" />
      </div>

      <aside className="space-y-4">
        {v.message && (
          <div className="card p-4 text-sm">
            <div className="label">Note from {v.sentBy}</div>
            <p className="whitespace-pre-wrap">{v.message}</p>
          </div>
        )}
        <div className="card space-y-4 p-5">
          <label className="flex gap-3 text-sm">
            <input type="checkbox" className="mt-1 accent-brand-600" checked={consent} onChange={(e) => agree(e.target.checked)} />
            <span>
              I agree to use electronic records and signatures for this document, and that my electronic signature is as binding as an ink signature. I can
              ask {v.sentBy} for a paper copy at no charge, and I can decline by closing this page before signing.
            </span>
          </label>

          <div className={consent ? "" : "pointer-events-none opacity-40"}>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1 text-sm">
              {(["typed", "drawn", "ink"] as const).map((m) => (
                <button key={m} className={`rounded-md py-1.5 ${mode === m ? "bg-white font-semibold shadow-sm" : "text-stone-600"}`} onClick={() => setMode(m)}>
                  {m === "typed" ? "Type" : m === "drawn" ? "Draw" : "Sign on paper"}
                </button>
              ))}
            </div>

            {mode === "typed" && (
              <div className="space-y-2">
                <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
                <div className="grid h-20 place-items-center rounded-lg border border-dashed border-stone-300 bg-white text-4xl text-[#0b1f5c]" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 600 }}>
                  {typed || " "}
                </div>
              </div>
            )}
            {mode === "drawn" && <DrawPad canvas={draw} onDrawn={setDrawn} />}
            {mode === "ink" && (
              <div className="space-y-2 text-sm text-stone-600">
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    <a className="text-brand-600 underline" href={`${base}/pdf?download=1`}>
                      Download the document
                    </a>
                    , print it, then sign{v.initialsNeeded ? " and initial each page" : ""}.
                  </li>
                  <li>Scan or photograph every page and upload it below (PDF, JPG or PNG).</li>
                </ol>
              </div>
            )}

            {v.initialsNeeded && mode !== "ink" && (
              <label className="mt-4 block">
                <span className="label">Your initials (added to every page footer)</span>
                <input className="input w-28 uppercase" maxLength={4} value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase())} />
              </label>
            )}

            <div className="mt-4">
              <span className="label">{mode === "ink" ? "Signed copy" : "Attachments (optional)"}</span>
              {v.me.role === "tenant" && mode !== "ink" && <p className="mb-2 text-xs text-stone-500">For example, a notarized Exhibit A if your lease includes one.</p>}
              <button className="btn-secondary w-full" onClick={() => fileInput.current?.click()}>
                Choose files…
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 5));
                  e.target.value = "";
                }}
              />
              {files.map((f, i) => (
                <div key={i} className="mt-1 flex items-center justify-between text-xs">
                  <span className="truncate">{f.name}</span>
                  <button className="text-stone-500 hover:text-red-700" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {err && <Alert tone="error">{err}</Alert>}
          <button className="btn-primary w-full py-3" disabled={!consent || busy} onClick={submit}>
            {busy ? (
              <>
                <Spinner /> Signing…
              </>
            ) : (
              "Sign"
            )}
          </button>
          <p className="text-xs text-stone-500">By clicking Sign you adopt the signature above as your legal signature on this document.</p>
        </div>
      </aside>
    </div>
  );
}

function DrawPad({ canvas, onDrawn }: { canvas: React.RefObject<HTMLCanvasElement | null>; onDrawn: (v: boolean) => void }) {
  const drawing = useRef(false);
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f5c";
  }, [canvas]);
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  return (
    <div>
      <canvas
        ref={canvas}
        className="h-32 w-full touch-none rounded-lg border border-dashed border-stone-300 bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(...pos(e));
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current!.getContext("2d")!;
          ctx.lineTo(...pos(e));
          ctx.stroke();
          onDrawn(true);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <button
        className="mt-1 text-xs text-stone-500 hover:underline"
        onClick={() => {
          const c = canvas.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          onDrawn(false);
        }}
      >
        Clear
      </button>
    </div>
  );
}
