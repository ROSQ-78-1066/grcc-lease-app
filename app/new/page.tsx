import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Wizard } from "@/components/wizard/Wizard";
import { getSession } from "@/lib/session";

export default async function NewLease() {
  const s = await getSession();
  if (!s) redirect("/api/auth/login");
  return (
    <AppShell user={s.user} active="new">
      <Wizard />
    </AppShell>
  );
}
