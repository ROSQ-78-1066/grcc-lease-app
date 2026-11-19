import type { Metadata } from "next";
import { ApplyClient } from "@/components/public/ApplyClient";

export const metadata: Metadata = { title: "Tenant application", robots: { index: false, follow: false } };

export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ApplyClient token={token} />;
}
