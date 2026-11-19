import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "./config";
import { codeRequired, Envelope, loadEnvelope } from "./signing";
import { linkStorage, openLink, openSmall, sealSmall } from "./links";
import { Storage } from "./storage/types";

export class PublicError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function publicError(e: unknown): Response {
  if (e instanceof PublicError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[public]", msg);
  // Storage / Egnyte details stay in the server log.
  const safe = /egnyte|token|ECONN|fetch failed/i.test(msg) ? "Something went wrong on our side. Please try again in a few minutes." : msg;
  return NextResponse.json({ error: safe }, { status: 500 });
}

const cookieName = (env: string, i: number) => `sv_${env}_${i}`;

export interface SignerCtx {
  storage: Storage;
  env: Envelope;
  i: number;
  egnyteToken: string;
  verified: boolean;
}

/** Resolve a signing link token to its envelope and signer. */
export async function signerCtx(token: string): Promise<SignerCtx> {
  const p = await openLink(token, "sign");
  if (!p || p.s === undefined) throw new PublicError("This signing link is not valid or has expired.", 404);
  const storage = linkStorage(p);
  const env = await loadEnvelope(storage, p.id);
  if (!env || !env.signers[p.s]) throw new PublicError("This signing link is not valid.", 404);
  if (env.status === "voided") throw new PublicError("This document was withdrawn by the sender. Please contact them if you have questions.", 410);
  let verified = !codeRequired();
  if (!verified) {
    const c = (await cookies()).get(cookieName(env.id, p.s));
    const v = c ? await openSmall<{ e: string; i: number }>(c.value) : null;
    verified = !!v && v.e === env.id && v.i === p.s;
  }
  return { storage, env, i: p.s, egnyteToken: p.t, verified };
}

export async function setVerifiedCookie(res: NextResponse, env: string, i: number) {
  res.cookies.set(cookieName(env, i), await sealSmall({ e: env, i }, "4h"), {
    httpOnly: true,
    secure: config.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 4 * 3600,
  });
}
