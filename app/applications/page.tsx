import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Applications } from "@/components/Applications";
import { getSession } from "@/lib/session";

export default async function ApplicationsPage() {
  const s = await getSession();
  if (!s) redirect("/api/auth/login");
  return (
    <AppShell user={s.user} active="applications">
      <Applications />
    </AppShell>
  );
}
