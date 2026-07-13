import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDocumentMimeType,
  decodeTextDocument,
  documentExtension,
  formatFileSize,
  hasValidDocumentSignature,
  MAX_FILE_SIZE,
  MAX_RICH_DOCUMENT_SIZE,
  MAX_RTF_FILE_SIZE,
  MAX_TEXT_FILE_SIZE,
  MAX_TEXT_LENGTH,
  safeDocumentFilename,
  validateDocumentFile,
} from "../app/file-validation.ts";

const encoder = new TextEncoder();

function utf16(text, bigEndian = false) {
  const bytes = Buffer.alloc(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    if (bigEndian) bytes.writeUInt16BE(text.charCodeAt(index), index * 2);
    else bytes.writeUInt16LE(text.charCodeAt(index), index * 2);
  }
  return new Uint8Array(Buffer.concat([
    Buffer.from(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]),
    bytes,
  ]));
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data ?? "", typeof entry.data === "string" ? "utf8" : undefined);
    const flags = entry.flags ?? 0;
    const method = entry.method ?? 0;
    const compressedSize = entry.compressedSize ?? data.length;
    const uncompressedSize = entry.uncompressedSize ?? data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);

    localOffset += local.length + name.length + data.length;
  }

  const localBytes = Buffer.concat(localParts);
  const centralBytes = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  return new Uint8Array(Buffer.concat([localBytes, centralBytes, eocd]));
}

function minimalDocx(extraEntries = []) {
  return buildZip([
    { name: "[Content_Types].xml", data: "<Types/>" },
    { name: "_rels/.rels", data: "<Relationships/>" },
    { name: "word/document.xml", data: "<document/>" },
    ...extraEntries,
  ]);
}

function minimalOdt(extraEntries = []) {
  return buildZip([
    { name: "mimetype", data: "application/vnd.oasis.opendocument.text" },
    { name: "content.xml", data: "<office:document-content/>" },
    ...extraEntries,
  ]);
}

test("accepts supported images and PDFs and reports their extension", () => {
  assert.deepEqual(
    validateDocumentFile({ name: "letter.pdf", size: 1200, type: "application/pdf" }),
    { ok: true, kind: "pdf", extension: "pdf" },
  );
  assert.deepEqual(
    validateDocumentFile({ name: "photo.WEBP", size: 2400, type: "image/webp" }),
    { ok: true, kind: "image", extension: "webp" },
  );
  assert.deepEqual(
    validateDocumentFile({ name: "scan.jpg", size: 2400, type: "" }),
    { ok: true, kind: "image", extension: "jpg" },
  );
});

test("accepts TXT, RTF, DOCX and ODT with their canonical or empty MIME types", () => {
  const cases = [
    ["notes.txt", "text/plain", "text", "txt"],
    ["letter.rtf", "application/rtf", "document", "rtf"],
    ["letter.rtf", "text/rtf", "document", "rtf"],
    ["letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document", "docx"],
    ["letter.odt", "application/vnd.oasis.opendocument.text", "document", "odt"],
  ];
  for (const [name, type, kind, extension] of cases) {
    assert.deepEqual(validateDocumentFile({ name, size: 1024, type }), { ok: true, kind, extension });
    assert.deepEqual(validateDocumentFile({ name, size: 1024, type: "" }), { ok: true, kind, extension });
  }
});

test("applies a separate safe size limit to every file family", () => {
  const cases = [
    ["scan.pdf", "application/pdf", MAX_FILE_SIZE],
    ["scan.png", "image/png", MAX_FILE_SIZE],
    ["notes.txt", "text/plain", MAX_TEXT_FILE_SIZE],
    ["letter.rtf", "application/rtf", MAX_RTF_FILE_SIZE],
    ["letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", MAX_RICH_DOCUMENT_SIZE],
    ["letter.odt", "application/vnd.oasis.opendocument.text", MAX_RICH_DOCUMENT_SIZE],
  ];
  for (const [name, type, maxSize] of cases) {
    assert.equal(validateDocumentFile({ name, size: maxSize, type }).ok, true, `${name} at limit`);
    assert.deepEqual(validateDocumentFile({ name, size: maxSize + 1, type }).code, "too_large", `${name} over limit`);
  }
});

test("rejects empty, unsupported and MIME-mismatched files", () => {
  assert.equal(validateDocumentFile({ name: "empty.pdf", size: 0, type: "application/pdf" }).code, "empty");
  assert.equal(validateDocumentFile({ name: "archive.zip", size: 1200, type: "application/zip" }).code, "unsupported");
  assert.equal(validateDocumentFile({ name: "renamed.pdf", size: 1200, type: "text/html" }).code, "unsupported");
  assert.equal(validateDocumentFile({ name: "renamed.docx", size: 1200, type: "application/zip" }).code, "unsupported");
  assert.equal(validateDocumentFile({ name: "notes.txt", size: 1200, type: "application/pdf" }).code, "unsupported");
  assert.equal(validateDocumentFile({ name: "image.exe", size: 1200, type: "image/png" }).code, "unsupported");
});

test("decodes UTF-8 TXT with and without BOM", () => {
  const text = "Sveiki! Привет, Latvija.";
  assert.deepEqual(decodeTextDocument(encoder.encode(text)), { ok: true, text });
  assert.deepEqual(
    decodeTextDocument(new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode(text)])),
    { ok: true, text },
  );
  assert.equal(hasValidDocumentSignature("notes.txt", encoder.encode(text)), true);
});

test("decodes BOM-marked UTF-16 little-endian and big-endian TXT", () => {
  const text = "Rīga — документ №42";
  assert.deepEqual(decodeTextDocument(utf16(text)), { ok: true, text });
  assert.deepEqual(decodeTextDocument(utf16(text, true)), { ok: true, text });
  assert.equal(hasValidDocumentSignature("notes.txt", utf16(text)), true);
  assert.equal(hasValidDocumentSignature("notes.txt", utf16(text, true)), true);
});

test("rejects invalid, binary, empty and overlong TXT content", () => {
  assert.deepEqual(decodeTextDocument(new Uint8Array([0xc3, 0x28])), { ok: false, reason: "encoding" });
  assert.deepEqual(decodeTextDocument(new Uint8Array([0, 1, 2, 3, 65])), { ok: false, reason: "binary" });
  assert.deepEqual(decodeTextDocument(encoder.encode(" \r\n\t ")), { ok: false, reason: "empty" });
  assert.deepEqual(
    decodeTextDocument(encoder.encode("x".repeat(MAX_TEXT_LENGTH + 1))),
    { ok: false, reason: "too_long" },
  );
  assert.equal(hasValidDocumentSignature("notes.txt", new Uint8Array([0xc3, 0x28])), false);
  assert.equal(hasValidDocumentSignature("notes.txt", new Uint8Array([0, 1, 2, 3, 65])), false);
});

test("recognizes plain and UTF-8-BOM RTF headers but rejects disguised text", () => {
  const rtf = encoder.encode("{\\rtf1\\ansi Hello}");
  const bomRtf = new Uint8Array([0xef, 0xbb, 0xbf, ...rtf]);
  assert.equal(hasValidDocumentSignature("letter.rtf", rtf), true);
  assert.equal(hasValidDocumentSignature("letter.rtf", bomRtf), true);
  assert.equal(hasValidDocumentSignature("letter.rtf", encoder.encode("plain text")), false);
  assert.equal(hasValidDocumentSignature("letter.rtf", encoder.encode(" {\\rtf1 disguised}")), false);
});

test("accepts a minimal DOCX container and rejects renamed or incomplete ZIP files", () => {
  assert.equal(hasValidDocumentSignature("letter.docx", minimalDocx()), true);
  assert.equal(hasValidDocumentSignature("letter.docx", minimalOdt()), false);
  assert.equal(
    hasValidDocumentSignature("letter.docx", buildZip([
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "_rels/.rels", data: "<Relationships/>" },
    ])),
    false,
  );
  assert.equal(hasValidDocumentSignature("letter.docx", encoder.encode("not a ZIP")), false);
});

test("rejects macro-enabled, path-traversing and zip-bomb DOCX containers", () => {
  assert.equal(
    hasValidDocumentSignature("letter.docx", minimalDocx([{ name: "word/vbaProject.bin", data: "macro" }])),
    false,
  );
  assert.equal(
    hasValidDocumentSignature("letter.docx", minimalDocx([{ name: "../payload.exe", data: "payload" }])),
    false,
  );
  assert.equal(
    hasValidDocumentSignature("letter.docx", buildZip([
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "_rels/.rels", data: "<Relationships/>" },
      { name: "word/document.xml", data: "x", compressedSize: 1, uncompressedSize: 101 },
    ])),
    false,
  );
});

test("accepts a minimal ODT container and rejects renamed or malformed ODT files", () => {
  assert.equal(hasValidDocumentSignature("letter.odt", minimalOdt()), true);
  assert.equal(hasValidDocumentSignature("letter.odt", minimalDocx()), false);
  assert.equal(
    hasValidDocumentSignature("letter.odt", buildZip([
      { name: "mimetype", data: "application/zip" },
      { name: "content.xml", data: "<office:document-content/>" },
    ])),
    false,
  );
  assert.equal(
    hasValidDocumentSignature("letter.odt", buildZip([
      { name: "mimetype", data: "application/vnd.oasis.opendocument.text", method: 8 },
      { name: "content.xml", data: "<office:document-content/>" },
    ])),
    false,
  );
  assert.equal(
    hasValidDocumentSignature("letter.odt", buildZip([
      { name: "mimetype", data: "application/vnd.oasis.opendocument.text" },
    ])),
    false,
  );
});

test("checks image and PDF signatures independently of the filename", () => {
  assert.equal(hasValidDocumentSignature("letter.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), true);
  assert.equal(hasValidDocumentSignature("photo.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(hasValidDocumentSignature("scan.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasValidDocumentSignature("photo.webp", new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), true);
  assert.equal(hasValidDocumentSignature("fake.pdf", encoder.encode("<html>not a pdf</html>")), false);
  assert.equal(hasValidDocumentSignature("unknown.exe", encoder.encode("anything")), false);
});

test("normalizes extensions, MIME types and filenames without retaining user-controlled paths", () => {
  assert.equal(documentExtension("PHOTO.WEBP"), "webp");
  assert.equal(documentExtension("letter.final.DOCX"), "docx");
  assert.equal(documentExtension("letter.docx.exe"), null);
  assert.equal(documentExtension("no-extension"), null);
  assert.equal(canonicalDocumentMimeType("PHOTO.WEBP"), "image/webp");
  assert.equal(canonicalDocumentMimeType("letter.RTF"), "application/rtf");
  assert.equal(canonicalDocumentMimeType("letter.DOCX"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(canonicalDocumentMimeType("unknown.bin"), null);
  assert.equal(safeDocumentFilename("../../Мой паспорт.Final.DOCX"), "document.docx");
  assert.equal(safeDocumentFilename("C:\\Users\\person\\notes.TXT"), "document.txt");
  assert.equal(safeDocumentFilename("report.pdf.exe"), null);
});

test("formats file sizes for the interface", () => {
  assert.equal(formatFileSize(850), "1 КБ");
  assert.equal(formatFileSize(2 * 1024 * 1024), "2 МБ");
  assert.equal(formatFileSize(2.5 * 1024 * 1024), "2,5 МБ");
  assert.equal(formatFileSize(2.5 * 1024 * 1024, "lv"), "2,5 MB");
  assert.equal(formatFileSize(2.5 * 1024 * 1024, "en"), "2.5 MB");
});
