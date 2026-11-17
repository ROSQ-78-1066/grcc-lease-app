import type { Metadata } from "next";
import "./globals.css";

// Always render per request: pages depend on the signed-in Egnyte session and runtime env.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NNN Lease Generator",
  description: "Generate, customize and route Triple Net leases",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
