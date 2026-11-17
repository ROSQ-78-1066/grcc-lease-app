import { NextResponse } from "next/server";
import { config, folderPath } from "@/lib/config";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";

// POST — registers the Egnyte webhook for /Draft Leases using the signed-in user's token
// (token needs the Egnyte.webhooks scope).
export const POST = withAuth(async (session) => {
  if (config.demoMode) return NextResponse.json({ error: "Not available in demo mode" }, { status: 400 });
  if (!config.webhookSecret) return NextResponse.json({ error: "Set WEBHOOK_AUTH_SECRET first." }, { status: 400 });
  const res = await fetch(`https://${config.egnyte.domain}.egnyte.com/pubapi/v1/webhooks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${config.appUrl}/api/webhooks/egnyte`,
      eventType: ["fs:add_file", "fs:move_file"],
      path: folderPath("drafts"),
      authHeader: `Bearer ${config.webhookSecret}`,
    }),
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ error: `Egnyte returned ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
  return NextResponse.json({ ok: true, webhook: JSON.parse(text || "{}") });
});
