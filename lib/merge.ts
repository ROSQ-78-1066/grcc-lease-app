import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

/**
 * Merge data into a tagged lease template.
 *
 * The templates use {{FIELD}} for values and {#SECTION}...{/SECTION} for
 * conditional blocks. docxtemplater uses one delimiter style, so the
 * double braces are normalised to single braces before rendering.
 */
export function mergeDocx(template: Buffer, data: Record<string, unknown>): Buffer {
  const zip = new PizZip(template);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = zip.file(name)!.asText();
    zip.file(name, xml.replace(/\{\{/g, "{").replace(/\}\}/g, "}"));
  }
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true, // removes paragraphs that only hold a {#..}/{/..} tag
    linebreaks: true, // newlines in custom provisions become line breaks
    nullGetter: () => "",
  });
  try {
    doc.render(data);
  } catch (e) {
    const errs = (e as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors;
    if (errs?.length) throw new Error("Template error: " + errs.map((x) => x.properties?.explanation).join("; "));
    throw e;
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
