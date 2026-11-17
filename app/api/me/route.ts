import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { emailEnabled } from "@/lib/email";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";

// GET — signed-in user and a setup checklist; ?token=1 reveals the user's Egnyte
// token so it can be pasted into EGNYTE_SERVICE_TOKEN for the webhook.
export const GET = withAuth(async (session, _storage, req) => {
  const showToken = new URL(req.url).searchParams.get("token") === "1" && !config.demoMode;
  return NextResponse.json({
    user: session.user,
    demoMode: config.demoMode,
    egnyteDomain: config.egnyte.domain,
    root: config.folders.root,
    folders: config.folders,
    templates: config.templates,
    model: config.anthropic.model,
    checks: {
      anthropic: !!config.anthropic.apiKey,
      email: emailEnabled(),
      emailProvider: config.email.provider,
      serviceToken: !!config.egnyte.serviceToken,
      webhookSecret: !!config.webhookSecret,
    },
    landlordEmail: config.lease.landlordEmail,
    token: showToken ? session.token : undefined,
  });
});
