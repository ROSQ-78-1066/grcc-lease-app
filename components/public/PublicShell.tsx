import { ReactNode } from "react";

export function PublicShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">BCC</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Bluewater Corporate Center</div>
            <div className="text-xs text-stone-500">{title}</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-5 pb-10 text-xs text-stone-400">Roger B. Chaffee Memorial Blvd. SE, Wyoming, MI 49548 · Private link — please don’t share it.</footer>
    </div>
  );
}
