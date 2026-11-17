import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 font-bold text-white">NNN</div>
        <h1 className="text-xl font-semibold">Lease Generator</h1>
        <p className="mt-2 text-sm text-stone-600">Sign in with your Egnyte account ({config.egnyte.domain}.egnyte.com).</p>
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <a href="/api/auth/login" className="btn-primary mt-6 w-full py-2.5">
          Sign in with Egnyte
        </a>
      </div>
    </div>
  );
}
