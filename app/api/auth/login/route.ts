import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

// Starts the Egnyte OAuth 2.0 Authorization Code flow against OUR Egnyte domain,
// so only users who can sign in to that domain can get a token.
export async function GET(req: NextRequest) {
  if (config.demoMode) return NextResponse.redirect(`${config.appUrl}/`);
  const state = crypto.randomUUID();
  // Keep the last few pending sign-ins: a page redirect and a background prefetch can both start
  // one, and the later one must not invalidate the sign-in the user actually completes.
  const pending = (req.cookies.get("oauth_state")?.value || "").split(".").filter(Boolean).slice(-4);
  const url = new URL(`https://${config.egnyte.domain}.egnyte.com/puboauth/token`);
  url.searchParams.set("client_id", config.egnyte.clientId);
  url.searchParams.set("redirect_uri", `${config.appUrl}/api/auth/callback`);
  url.searchParams.set("scope", config.egnyte.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("oauth_state", [...pending, state].join("."), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: config.appUrl.startsWith("https://") });
  return res;
}
