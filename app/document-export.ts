import type { GeneratedDocument } from "./document-studio-schema.ts";

const enc = new TextEncoder();
function crc32(data: Uint8Array) { let c = 0xffffffff; for (const b of data) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function u16(v: number) { return new Uint8Array([v & 255, (v >>> 8) & 255]); }
function u32(v: number) { return new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]); }
function join(parts: Uint8Array[]) { const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of parts) { out.set(x, p); p += x.length; } return out; }
function zip(files: { name: string; data: Uint8Array }[]) { const local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0; for (const f of files) { const n = enc.encode(f.name), crc = crc32(f.data); const h = join([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(f.data.length), u32(f.data.length), u16(n.length), u16(0), n]); local.push(h, f.data); central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(f.data.length), u32(f.data.length), u16(n.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), n])); offset += h.length + f.data.length; } const c = join(central); return join([...local, c, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(c.length), u32(offset), u16(0)]); }
const xml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function decodeHtml(value: string) {
  return value.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16))).replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

function richParagraph(tag: string, inner: string) {
  let bold = /^h[1-3]$/.test(tag), italic = false, underline = false, color = "";
  const size = tag === "h1" ? 34 : tag === "h2" ? 28 : tag === "h3" ? 24 : 22;
  const colors: Record<string, string> = { accent: "087D72", red: "B02A37", blue: "245FA8", gray: "6B7774" };
  const runs = (inner.match(/<[^>]+>|[^<]+/g) ?? []).flatMap((token) => {
    if (token.startsWith("<")) {
      const lower = token.toLowerCase();
      if (/^<strong/.test(lower)) bold = true; else if (/^<\/strong/.test(lower)) bold = /^h[1-3]$/.test(tag);
      else if (/^<em/.test(lower)) italic = true; else if (/^<\/em/.test(lower)) italic = false;
      else if (/^<u[\s>]/.test(lower)) underline = true; else if (/^<\/u/.test(lower)) underline = false;
      else if (/^<span/.test(lower)) { const match = lower.match(/editor-color-(accent|red|blue|gray)/); color = match?.[1] ?? ""; }
      else if (/^<\/span/.test(lower)) color = "";
      else if (/^<br/.test(lower)) return ["<w:r><w:br/></w:r>"];
      return [];
    }
    const text = decodeHtml(token); if (!text) return [];
    const properties = [bold ? "<w:b/>" : "", italic ? "<w:i/>" : "", underline ? '<w:u w:val="single"/>' : "", `<w:sz w:val="${size}"/>`, color ? `<w:color w:val="${colors[color]}"/>` : ""].join("");
    return [`<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`];
  }).join("");
  const before = tag === "h1" ? 240 : tag === "h2" ? 200 : tag === "h3" ? 160 : 80, after = tag === "li" ? 40 : 100;
  const prefix = tag === "li" ? '<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">• </w:t></w:r>' : "";
  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/>${/^h[1-3]$/.test(tag) ? "<w:keepNext/>" : ""}</w:pPr>${prefix}${runs}</w:p>`;
}

function richDocumentParagraphs(d: GeneratedDocument) {
  if (!d.editorHtml) return d.plainText.split(/\r?\n/).map((line) => richParagraph("p", xml(line))).join("");
  const blocks = [...d.editorHtml.matchAll(/<(h1|h2|h3|p|li)>([\s\S]*?)<\/\1>/gi)].map((match) => richParagraph(match[1].toLowerCase(), match[2]));
  return blocks.length ? blocks.join("") : d.plainText.split(/\r?\n/).map((line) => richParagraph("p", xml(line))).join("");
}

export function documentDocx(d: GeneratedDocument) {
  const paragraphs = richDocumentParagraphs(d);
  return zip([
    { name: "[Content_Types].xml", data: enc.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: "_rels/.rels", data: enc.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: "word/document.xml", data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`) },
  ]);
}

function pdfEscape(s: string) { return s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[^\x20-\x7E]/g, "?"); }
// The PDF writer appends to `out`; `offsets` is intentionally immutable.
// eslint-disable-next-line prefer-const
export function documentPdf(d: GeneratedDocument) { const lines = d.plainText.split(/\r?\n/).flatMap((x) => x.match(/.{1,88}(?:\s|$)/g) ?? [x]).slice(0, 52); const stream = `BT /F1 11 Tf 50 790 Td 14 TL ${lines.map((x, i) => `${i ? "T* " : ""}(${pdfEscape(x.trim())}) Tj`).join(" ")} ET`; const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]; let out = "%PDF-1.4\n", offsets = [0]; objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; }); const xref = out.length; out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((x) => String(x).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return enc.encode(out); }
