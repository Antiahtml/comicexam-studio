/** Detección del tipo real de archivo por "números mágicos" (no por la extensión). */

export type ArchiveKind = "rar" | "zip";
export type ImageKind = "jpeg" | "png" | "webp" | "gif" | "avif" | "bmp" | "tiff";

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

export function detectArchive(head: Uint8Array): ArchiveKind | null {
  // RAR 1.5–4.x: "Rar!\x1A\x07\x00"  ·  RAR 5: "Rar!\x1A\x07\x01\x00"
  if (startsWith(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return "rar";
  // ZIP local file header / archivo vacío / multivolumen
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  return null;
}

export function detectImage(head: Uint8Array): ImageKind | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...head.slice(8, 12));
    if (brand === "avif" || brand === "avis") return "avif";
  }
  if (startsWith(head, [0x42, 0x4d])) return "bmp";
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  return null;
}

/** Formatos que se conservan tal cual como original; el resto se normaliza a PNG. */
export const PASSTHROUGH_IMAGE: Record<ImageKind, { ext: string; mime: string } | null> = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
  gif: null,
  avif: null,
  bmp: null,
  tiff: null,
};
