import type { Metadata } from "next";
import { SignClient } from "@/components/public/SignClient";

export const metadata: Metadata = { title: "Sign document", robots: { index: false, follow: false } };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignClient token={token} />;
}
