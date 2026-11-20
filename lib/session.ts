import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "./config";
import { EgnyteStorage } from "./storage/egnyte";
import { LocalStorage } from "./storage/local";
import { Storage, StorageError } from "./storage/types";

export const SESSION_COOKIE = "lease_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export interface SessionUser {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}
export interface Session {
  token: string;
  user: SessionUser;
}

async function key(): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.sessionSecret));
  return new Uint8Array(digest);
}

export async function sealSession(s: Session): Promise<string> {
  return new EncryptJWT({ ...s })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(await key());
}

export async function unsealSession(value: string): Promise<Session | null> {
  try {
    const { payload } = await jwtDecrypt(value, await key());
    return { token: payload.token as string, user: payload.user as SessionUser };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

const DEMO_USER: SessionUser = { username: "demo", firstName: "Demo", lastName: "Broker", email: "" };

export async function getSession(): Promise<Session | null> {
  if (config.demoMode) return { token: "demo", user: DEMO_USER };
  const c = (await cookies()).get(SESSION_COOKIE);
  if (!c) return null;
  return unsealSession(c.value);
}

export function storageFor(session: Session): Storage {
  return config.demoMode ? new LocalStorage() : new EgnyteStorage(session.token);
}

/** Storage used by background jobs (webhook) where no user is signed in. */
export function serviceStorage(): Storage | null {
  if (config.demoMode) return new LocalStorage();
  return config.egnyte.serviceToken ? new EgnyteStorage(config.egnyte.serviceToken) : null;
}

/** Wrap an API handler: requires a session, maps errors to JSON. */
export function withAuth<T extends unknown[]>(
  handler: (session: Session, storage: Storage, req: Request, ...rest: T) => Promise<Response>,
) {
  return async (req: Request, ...rest: T): Promise<Response> => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    try {
      return await handler(session, storageFor(session), req, ...rest);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  const status = e instanceof StorageError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  console.error("[api]", message);
  return NextResponse.json({ error: message }, { status });
}
