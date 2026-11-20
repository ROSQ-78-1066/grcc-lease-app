import Link from "next/link";
import { ReactNode } from "react";
import { config } from "@/lib/config";
import type { SessionUser } from "@/lib/session";

export function AppShell({ user, children, active }: { user: SessionUser; children: ReactNode; active?: "home" | "new" | "applications" | "settings" }) {
  const nav = [
    { href: "/", label: "Dashboard", key: "home" },
    { href: "/new", label: "New Lease", key: "new" },
    { href: "/applications", label: "Applications", key: "applications" },
    { href: "/settings", label: "Settings", key: "settings" },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 md:gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">NNN</span>
            <span className="whitespace-nowrap font-semibold">Lease Generator</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active === n.key ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-3 text-sm md:flex">
            {config.demoMode && <span className="badge bg-amber-100 text-amber-800">Demo mode</span>}
            <span className="text-stone-600">{`${user.firstName} ${user.lastName}`.trim() || user.username}</span>
            {!config.demoMode && (
              <a href="/api/auth/logout" className="text-stone-500 hover:text-stone-800">
                Sign out
              </a>
            )}
          </div>
          {/* Phones: ☰ menu */}
          <details className="group md:hidden">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-stone-200 text-xl text-stone-700 [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <span className="group-open:hidden">☰</span>
              <span className="hidden group-open:inline">✕</span>
            </summary>
            <div className="absolute inset-x-0 top-full z-40 border-b border-stone-200 bg-white px-4 pb-4 shadow-lg">
              <nav className="flex flex-col py-2">
                {nav.map((n) => (
                  <Link
                    key={n.key}
                    href={n.href}
                    className={`rounded-lg px-3 py-3 text-base font-medium ${active === n.key ? "bg-brand-50 text-brand-700" : "text-stone-700"}`}
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center justify-between border-t border-stone-100 px-3 pt-3 text-sm">
                <span className="text-stone-600">{`${user.firstName} ${user.lastName}`.trim() || user.username}</span>
                {!config.demoMode && (
                  <a href="/api/auth/logout" className="text-stone-500">
                    Sign out
                  </a>
                )}
              </div>
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
