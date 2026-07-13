import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDocumentMimeType,
  formatFileSize,
  hasValidDocumentSignature,
  MAX_FILE_SIZE,
  validateDocumentFile,
} from "../app/file-validation.ts";

test("accepts supported images and PDFs", () => {
  assert.deepEqual(
    validateDocumentFile({ name: "letter.pdf", size: 1200, type: "application/pdf" }),
    { ok: true, kind: "pdf" },
  );
  assert.deepEqual(
    validateDocumentFile({ name: "photo.WEBP", size: 2400, type: "image/webp" }),
    { ok: true, kind: "image" },
  );
  assert.deepEqual(
    validateDocumentFile({ name: "scan.jpg", size: 2400, type: "" }),
    { ok: true, kind: "image" },
  );
});

test("rejects empty, oversized and unsupported files", () => {
  assert.equal(validateDocumentFile({ name: "empty.pdf", size: 0, type: "application/pdf" }).ok, false);
  assert.equal(validateDocumentFile({ name: "large.pdf", size: MAX_FILE_SIZE + 1, type: "application/pdf" }).ok, false);
  assert.equal(validateDocumentFile({ name: "archive.zip", size: 1200, type: "application/zip" }).ok, false);
  assert.equal(validateDocumentFile({ name: "renamed.pdf", size: 1200, type: "text/html" }).ok, false);
  assert.equal(validateDocumentFile({ name: "image.exe", size: 1200, type: "image/png" }).ok, false);
});

test("checks real file signatures and canonical MIME types", () => {
  assert.equal(hasValidDocumentSignature("letter.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), true);
  assert.equal(hasValidDocumentSignature("photo.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(hasValidDocumentSignature("scan.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasValidDocumentSignature("fake.pdf", new TextEncoder().encode("<html>not a pdf</html>")), false);
  assert.equal(canonicalDocumentMimeType("PHOTO.WEBP"), "image/webp");
});

test("formats file sizes for the interface", () => {
  assert.equal(formatFileSize(850), "1 КБ");
  assert.equal(formatFileSize(2 * 1024 * 1024), "2 МБ");
  assert.equal(formatFileSize(2.5 * 1024 * 1024), "2,5 МБ");
  assert.equal(formatFileSize(2.5 * 1024 * 1024, "lv"), "2,5 MB");
  assert.equal(formatFileSize(2.5 * 1024 * 1024, "en"), "2.5 MB");
});
