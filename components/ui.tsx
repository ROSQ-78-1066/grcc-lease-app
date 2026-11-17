"use client";
import { TEMPLATE_LABEL } from "@/lib/lease";
import { ReactNode } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) {
    const err = new Error((body as { error?: string })?.error || `Request failed (${res.status})`) as Error & { body?: unknown };
    err.body = body;
    throw err;
  }
  return body as T;
}

export function postJSON<T = unknown>(url: string, data: unknown) {
  return api<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

export const downloadUrl = (path: string, inline = false) =>
  `/api/files/download?path=${encodeURIComponent(path)}${inline ? "&inline=1" : ""}`;

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" className="opacity-75" />
    </svg>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const c = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left text-sm font-medium">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand-600" : "bg-stone-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-5.5" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-700">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function TemplateBadge({ t, large = false }: { t: "A" | "B" | null; large?: boolean }) {
  if (!t) return <span className="badge bg-stone-200 text-stone-700">Template not set</span>;
  const cls = t === "A" ? "bg-indigo-100 text-indigo-800" : "bg-orange-100 text-orange-800";
  return (
    <span className={`badge ${cls} ${large ? "px-3 py-1 text-sm" : ""}`}>
      {TEMPLATE_LABEL[t].full}
    </span>
  );
}
