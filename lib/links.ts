import { EncryptJWT, jwtDecrypt } from "jose";
import { config } from "./config";
import { EgnyteStorage } from "./storage/egnyte";
import { LocalStorage } from "./storage/local";
import { Storage } from "./storage/types";

/**
 * Private links for people who don't sign in (tenants filling in an application, signers).
 *
 * The link token is encrypted (not just signed) with a key derived from SESSION_SECRET, so its
 * contents can't be read or changed. It carries the Egnyte token of the broker who created the
 * link: the server uses it to read and write only the files that link is for. Egnyte tokens don't
 * expire, so links keep working after the broker signs out. If EGNYTE_SERVICE_TOKEN is set, that
 * token is used instead.
 */

export interface LinkPayload {
  /** What the link is for. */
  k: "apply" | "sign";
  /** Record id (application link id or envelope id). */
  id: string;
  /** Signer index (signing links only). */
  s?: number;
  /** Egnyte token of the broker who created the link. */
  t: string;
}

async function linkKey(): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`link:v1:${config.sessionSecret}`));
  return new Uint8Array(digest);
}

export async function sealLink(p: LinkPayload, ttlDays: number): Promise<string> {
  return new EncryptJWT({ ...p })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(1, Math.round(ttlDays))}d`)
    .encrypt(await linkKey());
}

export async function openLink(token: string, kind: LinkPayload["k"]): Promise<LinkPayload | null> {
  try {
    const { payload } = await jwtDecrypt(token, await linkKey());
    if (payload.k !== kind || typeof payload.id !== "string" || typeof payload.t !== "string") return null;
    return { k: kind, id: payload.id, s: typeof payload.s === "number" ? payload.s : undefined, t: payload.t };
  } catch {
    return null;
  }
}

/** Storage for a public (no sign-in) request. */
export function linkStorage(p: LinkPayload): Storage {
  if (config.demoMode) return new LocalStorage();
  return new EgnyteStorage(config.egnyte.serviceToken || p.t);
}

/** Short random id, safe for file names and URLs. */
export function newId(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return prefix + Buffer.from(b).toString("base64url");
}

/** Short-lived cookie/session token for a verified signer (after the email code). */
export async function sealSmall(data: Record<string, unknown>, ttl: string): Promise<string> {
  return new EncryptJWT(data)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .encrypt(await linkKey());
}

export async function openSmall<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, await linkKey());
    return payload as T;
  } catch {
    return null;
  }
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return Buffer.from(d).toString("hex");
}

/** Best-effort client IP behind Render's proxy. */
export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
