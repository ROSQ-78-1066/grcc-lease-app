import { NextResponse } from "next/server";
import { extractLeaseTerms, SourceDoc } from "@/lib/ai";
import { config, folderPath, isInsideRoot } from "@/lib/config";
import { safeName } from "@/lib/lease";
import { withAuth } from "@/lib/session";
import { StorageError } from "@/lib/storage/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST multipart: paths (JSON array of Egnyte paths), files (uploads), dealType, suiteNumber, currentTenant, saveUploads
export const POST = withAuth(async (_s, storage, req) => {
  const form = await req.formData();
  const paths = JSON.parse(String(form.get("paths") || "[]")) as string[];
  const dealType = (String(form.get("dealType")) === "renewal" ? "renewal" : "new") as "renewal" | "new";
  const suiteNumber = String(form.get("suiteNumber") || "");
  const currentTenant = String(form.get("currentTenant") || "");
  const saveUploads = String(form.get("saveUploads")) === "true";

  const docs: SourceDoc[] = [];
  const saved: string[] = [];
  for (const p of paths) {
    if (!isInsideRoot(p)) throw new StorageError("Path outside the Leasing App folder", 400);
    docs.push({ name: p.split("/").pop()!, data: await storage.download(p) });
  }
  for (const v of form.getAll("files")) {
    if (typeof v === "string") continue;
    const data = Buffer.from(await v.arrayBuffer());
    docs.push({ name: v.name, data });
    if (saveUploads) {
      const dest = `${folderPath("pendingDeals")}/${safeName(v.name)}`;
      await storage.upload(dest, data);
      saved.push(dest);
    }
  }
  if (!docs.length) return NextResponse.json({ error: "Choose at least one document." }, { status: 400 });
  if (docs.some((d) => /\.doc$/i.test(d.name)))
    return NextResponse.json({ error: "Old .doc files can't be read — save as .docx or PDF first." }, { status: 400 });

  const extracted = await extractLeaseTerms(docs, {
    dealType,
    suiteNumber,
    currentTenant,
    today: new Date().toISOString().slice(0, 10),
  });
  return NextResponse.json({ extracted, savedUploads: saved, model: config.anthropic.model });
});
