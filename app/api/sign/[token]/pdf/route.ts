import { publicError, PublicError, signerCtx } from "@/lib/publicRoute";
import { finalPdf, workingPdf } from "@/lib/signing";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET — the document as it stands (or the completed copy once everyone has signed)
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const c = await signerCtx((await params).token);
    if (!c.verified) throw new PublicError("Please enter the code we emailed you first.", 401);
    const done = c.env.status === "completed";
    const buf = done ? await finalPdf(c.storage, c.env) : await workingPdf(c.storage, c.env);
    if (!buf) throw new PublicError("The completed copy isn't ready yet.", 404);
    const name = done ? c.env.finalPath!.split("/").pop()! : c.env.documentName;
    const dl = new URL(req.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    return publicError(e);
  }
}
