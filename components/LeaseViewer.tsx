"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, downloadUrl, Spinner } from "./ui";

interface LeaseFile {
  name: string;
  path: string;
  display: string;
  modified: string;
  source: "current" | "old";
}

// One listing per page visit, shared by every button.
let cache: Promise<LeaseFile[]> | null = null;
function allLeases(): Promise<LeaseFile[]> {
  if (!cache)
    cache = api<{ files: LeaseFile[] }>("/api/leases")
      .then((r) => r.files)
      .catch((e) => {
        cache = null;
        throw e;
      });
  return cache;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const STOP = new Set(["llc", "inc", "inc.", "the", "co", "corp", "company", "and", "&", "of", "group", "services", "solutions"]);

/** Date the file is about, from its name ("(Dec 2025)", "2023"); falls back to the upload date. */
function dateKey(f: LeaseFile): number {
  const n = f.name.toLowerCase();
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+((?:19|20)\d{2})\b/.exec(n);
  if (m) return Number(m[2]) * 12 + MONTHS.indexOf(m[1]);
  const y = /\b((?:19|20)\d{2})\b/.exec(n);
  if (y) return Number(y[1]) * 12 + 11;
  const t = Date.parse(f.modified);
  return t ? new Date(t).getFullYear() * 12 + new Date(t).getMonth() : 0;
}

export function leasesForUnit(files: LeaseFile[], suite: string, tenant: string): LeaseFile[] {
  const unit = new RegExp(`(^|[^0-9])${suite.replace(/[^0-9A-Za-z]/g, "")}([^0-9]|$)`);
  const words = tenant
    .toLowerCase()
    .split(/[^a-z0-9&.]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  const hit = (f: LeaseFile) => {
    if (unit.test(f.display)) return true;
    // Old files are often named by tenant only (e.g. "Piedmont First Amendment").
    return f.source === "old" && words.length > 0 && words.some((w) => f.display.toLowerCase().includes(w));
  };
  // Files named for this unit ("Unit 3504 - …", "3504 …") rank above ones that only mention it.
  const own = new RegExp(`^(unit\\s*)?${suite.replace(/[^0-9A-Za-z]/g, "")}([^0-9]|$)`, "i");
  const rank = (f: LeaseFile) => (f.source === "current" ? 0 : 2) + (own.test(f.name) ? 0 : 1);
  return files.filter(hit).sort((a, b) => rank(a) - rank(b) || dateKey(b) - dateKey(a) || b.modified.localeCompare(a.modified));
}

/**
 * "View existing lease" — opens the latest lease for the unit from CURRENT LEASES
 * (or OLD LEASES when there's none) in a new browser tab. With several files, a small
 * menu lists them, newest first.
 */
export function LeaseViewerButton({
  suite,
  tenant,
  className = "",
  align = "right",
}: {
  suite: string;
  tenant: string;
  className?: string;
  align?: "right" | "center";
}) {
  const [files, setFiles] = useState<LeaseFile[] | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    allLeases()
      .then((f) => live && setFiles(f))
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const list = useMemo(() => (files ? leasesForUnit(files, suite, tenant) : []), [files, suite, tenant]);
  const current = list.filter((f) => f.source === "current");
  const old = list.filter((f) => f.source === "old");

  const base =
    "inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 shadow-sm transition hover:border-brand-600 hover:text-brand-700";
  const icon = (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
      <path d="M5 2.5h6.5L15 6v11.5H5z" />
      <path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h5" />
    </svg>
  );

  if (err) return <span className={`text-xs text-stone-400 ${className}`}>Couldn’t load the lease list</span>;
  if (!files)
    return (
      <span className={`${base} cursor-wait opacity-70 ${className}`}>
        <Spinner /> Looking for leases…
      </span>
    );
  if (!list.length)
    return (
      <span className={`${base} cursor-default opacity-60 hover:border-stone-300 hover:text-stone-700 ${className}`} title="Nothing in Current Leases or Old Leases for this unit">
        {icon} No lease on file
      </span>
    );

  const link = (f: LeaseFile, latest: boolean) => (
    <a
      key={f.path}
      href={downloadUrl(f.path, /\.pdf$/i.test(f.name))}
      target="_blank"
      rel="noreferrer"
      onClick={() => setOpen(false)}
      className="flex items-start gap-2 rounded-md px-3 py-2 text-sm hover:bg-brand-50"
    >
      <span className="mt-0.5 text-stone-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block break-words">{f.name}</span>
        {f.display !== f.name && <span className="block truncate text-xs text-stone-400">{f.display.slice(0, -f.name.length - 1)}</span>}
      </span>
      {latest && <span className="badge shrink-0 bg-emerald-100 text-emerald-800">Latest</span>}
      {!/\.pdf$/i.test(f.name) && <span className="badge shrink-0 bg-stone-100 text-stone-600">Word</span>}
    </a>
  );

  if (list.length === 1)
    return (
      <a className={`${base} ${className}`} href={downloadUrl(list[0].path, /\.pdf$/i.test(list[0].name))} target="_blank" rel="noreferrer" title={list[0].name}>
        {icon} View existing lease
      </a>
    );

  return (
    <div ref={box} className={`relative inline-block ${className}`}>
      <button type="button" className={base} onClick={() => setOpen(!open)} aria-expanded={open}>
        {icon} View existing lease <span className="text-xs text-stone-400">({list.length})</span>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M5.5 7.5 10 12l4.5-4.5z" />
        </svg>
      </button>
      {open && (
        <div className={`absolute z-30 mt-2 ${align === "center" ? "left-1/2 -translate-x-1/2" : "right-0"} max-h-[60vh] w-[min(560px,90vw)] overflow-auto rounded-xl border border-stone-200 bg-white p-2 text-left shadow-xl`}>
          {current.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Current leases</div>
              {current.map((f, i) => link(f, i === 0))}
            </>
          )}
          {old.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Old leases</div>
              {old.map((f, i) => link(f, !current.length && i === 0))}
            </>
          )}
          <p className="px-3 pb-1 pt-2 text-xs text-stone-400">Opens in a new tab. PDFs open in the browser; Word files download.</p>
        </div>
      )}
    </div>
  );
}
