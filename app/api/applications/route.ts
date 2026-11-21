import { NextResponse } from "next/server";
import { createLink, linkOpen, linkUrl, listLinks, UPLOAD_LIMITS } from "@/lib/applications";
import { emailEnabled } from "@/lib/email";
import { withAuth } from "@/lib/session";

export const runtime = "nodejs";

// GET — application links and their submissions
export const GET = withAuth(async (session, storage) => {
  const links = await listLinks(storage);
  return NextResponse.json({
    emailEnabled: emailEnabled(),
    limits: UPLOAD_LIMITS,
    links: await Promise.all(
      links.map(async (l) => ({
        id: l.id,
        createdAt: l.createdAt,
        createdBy: l.createdBy.name,
        suite: l.suite,
        prospect: l.prospect,
        prospectEmail: l.prospectEmail,
        expiresAt: l.expiresAt,
        open: !!l.open,
        notify: l.notify || [],
        status: l.status,
        closedReason: linkOpen(l),
        url: linkOpen(l) ? null : await linkUrl(l, session.token),
        submissions: await Promise.all(
          l.submissions.map(async (s) => ({ at: s.at, businessName: s.businessName, files: s.files, folder: s.folder, folderLink: await storage.webLink(s.folder).catch(() => null) })),
        ),
      })),
    ),
  });
});

// POST { suite, streetNumber, prospect, prospectEmail, days } — new private application link
export const POST = withAuth(async (session, storage, req) => {
  const body = (await req.json()) as {
    suite?: string;
    streetNumber?: string;
    prospect?: string;
    prospectEmail?: string;
    days?: number;
    open?: boolean;
    notify?: string[];
  };
  const name = `${session.user.firstName} ${session.user.lastName}`.trim() || session.user.username;
  const { rec, url, emailed } = await createLink(
    storage,
    {
      suite: body.suite || "",
      streetNumber: body.streetNumber || "",
      prospect: body.prospect || "",
      prospectEmail: body.prospectEmail || "",
      days: body.days ?? 14,
      open: !!body.open,
      notify: body.notify || [],
    },
    { name, email: session.user.email },
    session.token,
  );
  return NextResponse.json({ id: rec.id, url, emailed });
});
