import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Settings } from "@/components/Settings";
import { getSession } from "@/lib/session";

export default async function SettingsPage() {
  const s = await getSession();
  if (!s) redirect("/api/auth/login");
  return (
    <AppShell user={s.user} active="settings">
      <Settings />
    </AppShell>
  );
}
