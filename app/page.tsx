import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/components/Dashboard";
import { getSession } from "@/lib/session";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");
  return (
    <AppShell user={s.user} active="home">
      <Dashboard />
    </AppShell>
  );
}
