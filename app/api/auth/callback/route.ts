import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getSession, SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/session";
import { egnyteUserInfo } from "@/lib/storage/egnyte";

function fail(msg: string) {
  return NextResponse.redirect(`${config.appUrl}/login?error=${encodeURIComponent(msg)}`);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return fail(`Egnyte sign-in was cancelled (${err}).`);
  if (!code) return fail("Missing authorization code from Egnyte.");
  const pending = (req.cookies.get("oauth_state")?.value || "").split(".");
  if (!state || !pending.includes(state)) {
    // Already signed in (e.g. a second tab finished first)? Just continue.
    if (await getSession()) return NextResponse.redirect(`${config.appUrl}/`);
    return fail("Sign-in expired. Please try again.");
  }

  const body = new URLSearchParams({
    client_id: config.egnyte.clientId,
    client_secret: config.egnyte.clientSecret,
    redirect_uri: `${config.appUrl}/api/auth/callback`,
    code,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch(`https://${config.egnyte.domain}.egnyte.com/puboauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) return fail(`Egnyte token exchange failed (${tokenRes.status}).`);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return fail("Egnyte did not return an access token.");

  let user;
  try {
    user = await egnyteUserInfo(access_token);
  } catch {
    return fail("Could not verify your Egnyte account.");
  }

  const allowed = config.egnyte.allowedEmailDomains;
  if (allowed.length && user.email) {
    const dom = user.email.split("@")[1]?.toLowerCase();
    if (!dom || !allowed.includes(dom)) return fail("Your account is not allowed to use this app.");
  }

  const res = NextResponse.redirect(`${config.appUrl}/`);
  res.cookies.set(SESSION_COOKIE, await sealSession({ token: access_token, user }), sessionCookieOptions());
  res.cookies.delete("oauth_state");
  return res;
}
