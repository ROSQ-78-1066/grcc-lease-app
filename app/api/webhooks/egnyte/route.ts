import { NextResponse } from "next/server";
import { config, folderPath } from "@/lib/config";
import { fileExecutedLeases, looksSigned } from "@/lib/filing";
import { serviceStorage } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

interface EgnyteEvent {
  eventType?: string;
  data?: { targetPath?: string; itemType?: string };
}

// Egnyte calls this when a file lands in /Draft Leases (e.g. DocuSign returning the signed PDF).
// Egnyte sends the configured authHeader value in the Authorization header.
export async function POST(req: Request) {
  if (config.webhookSecret) {
    const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (got !== config.webhookSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const storage = serviceStorage();
  if (!storage) return NextResponse.json({ error: "EGNYTE_SERVICE_TOKEN is not set" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { data?: EgnyteEvent[] } | EgnyteEvent[];
  const events: EgnyteEvent[] = Array.isArray(body) ? body : body.data || [];
  const drafts = folderPath("drafts").toLowerCase();
  const paths = events
    .filter((e) => /fs:(add_file|move_file|copy_file)/.test(e.eventType || ""))
    .map((e) => e.data?.targetPath || "")
    .filter((p) => p.toLowerCase().startsWith(drafts + "/") && looksSigned(p.split("/").pop() || ""));

  const results = [];
  for (const p of paths) results.push(await fileExecutedLeases(storage, p));
  return NextResponse.json({ received: events.length, processed: paths.length, results });
}

// Lets you check the URL in a browser.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "Egnyte webhook listener" });
}
