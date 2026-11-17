import Link from "next/link";
import { ReactNode } from "react";
import { config } from "@/lib/config";
import type { SessionUser } from "@/lib/session";

export function AppShell({ user, children, active }: { user: SessionUser; children: ReactNode; active?: "home" | "new" | "settings" }) {
  const nav = [
    { href: "/", label: "Dashboard", key: "home" },
    { href: "/new", label: "New Lease", key: "new" },
    { href: "/settings", label: "Settings", key: "settings" },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">NNN</span>
            <span className="font-semibold">Lease Generator</span>
          </Link>
          <nav className="flex items-center gap-1">
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
          <div className="flex items-center gap-3 text-sm">
            {config.demoMode && <span className="badge bg-amber-100 text-amber-800">Demo mode</span>}
            <span className="text-stone-600">{`${user.firstName} ${user.lastName}`.trim() || user.username}</span>
            {!config.demoMode && (
              <a href="/api/auth/logout" className="text-stone-500 hover:text-stone-800">
                Sign out
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
