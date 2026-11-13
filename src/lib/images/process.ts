import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { config } from "../config";
import { detectImage, PASSTHROUGH_IMAGE } from "../archive/detect";
import { dataPath, ensureDir } from "../storage";
import { normalizedToPixels, type NormRect } from "../regions/coords";

sharp.cache(false);
sharp.concurrency(Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1)));

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export interface StoredImage {
  path: string;
  thumbPath: string;
  previewPath: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Valida una imagen (tipo real + decodificable + límite de píxeles) y la guarda
 * junto con su miniatura y su versión de previsualización.
 * El original se conserva intacto (JPG/PNG/WebP); otros formatos se convierten a PNG sin pérdida.
 */
export async function storeImage(data: Buffer, relDir: string, baseName: string): Promise<StoredImage> {
  const kind = detectImage(data.subarray(0, 32));
  if (!kind) throw new ImageError("El archivo no es una imagen válida o su formato no es compatible.");
  let meta: Metadata;
  try {
    meta = await sharp(data, { limitInputPixels: config.limits.maxImagePixels, failOn: "error" }).metadata();
  } catch {
    throw new ImageError("La imagen está dañada o es demasiado grande.");
  }
  if (!meta.width || !meta.height) throw new ImageError("No se han podido leer las dimensiones de la imagen.");

  const absDir = dataPath(relDir);
  await ensureDir(absDir);
  const pass = PASSTHROUGH_IMAGE[kind];
  let original = data;
  let ext = pass?.ext ?? "png";
  let mime = pass?.mime ?? "image/png";
  // Las imágenes con orientación EXIF se normalizan para que el recorte coincida con lo que se ve.
  const needsRotate = (meta.orientation ?? 1) > 1;
  if (!pass || needsRotate) {
    original = await sharp(data, { limitInputPixels: config.limits.maxImagePixels, animated: false })
      .rotate()
      .png()
      .toBuffer();
    ext = "png";
    mime = "image/png";
  }
  const finalMeta = needsRotate ? await sharp(original).metadata() : meta;
  const width = finalMeta.width!;
  const height = finalMeta.height!;

  const rel = path.join(/*turbopackIgnore: true*/ relDir, `${baseName}.${ext}`);
  const thumbRel = path.join(/*turbopackIgnore: true*/ relDir, `${baseName}.thumb.webp`);
  const previewRel = path.join(/*turbopackIgnore: true*/ relDir, `${baseName}.preview.webp`);
  await fs.writeFile(dataPath(rel), original);

  const base = sharp(original, { limitInputPixels: config.limits.maxImagePixels });
  await base
    .clone()
    .resize({ width: config.images.thumbWidth, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(dataPath(thumbRel));
  await base
    .clone()
    .resize({ width: config.images.previewWidth, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(dataPath(previewRel));

  return { path: rel, thumbPath: thumbRel, previewPath: previewRel, mime, width, height, bytes: original.byteLength };
}

export interface CropResult {
  file: string;
  mime: string;
}

/**
 * Recorta una región normalizada de la imagen ORIGINAL. Si `maxWidth` es 0 se devuelve a
 * resolución completa (para el PDF). Los resultados se guardan en caché en disco.
 */
export async function cropImage(
  originalRel: string,
  originalMime: string,
  imgW: number,
  imgH: number,
  rect: NormRect,
  maxWidth: number,
): Promise<CropResult> {
  const box = normalizedToPixels(rect, imgW, imgH);
  const key = crypto
    .createHash("sha1")
    .update(`${originalRel}|${box.left},${box.top},${box.width},${box.height}|${maxWidth}`)
    .digest("hex");
  const isPng = originalMime === "image/png";
  const ext = isPng ? "png" : "jpg";
  const cacheRel = path.join("cache", "crops", key.slice(0, 2), `${key}.${ext}`);
  const cacheAbs = dataPath(cacheRel);
  try {
    await fs.access(cacheAbs);
    return { file: cacheAbs, mime: isPng ? "image/png" : "image/jpeg" };
  } catch {
    /* no está en caché */
  }
  await ensureDir(path.dirname(cacheAbs));
  let pipeline = sharp(dataPath(originalRel), { limitInputPixels: config.limits.maxImagePixels }).extract(box);
  if (maxWidth > 0 && box.width > maxWidth) pipeline = pipeline.resize({ width: maxWidth });
  pipeline = isPng ? pipeline.png({ compressionLevel: 6 }) : pipeline.jpeg({ quality: maxWidth > 0 ? 85 : 95, mozjpeg: true });
  const tmp = `${cacheAbs}.${process.pid}.${Date.now()}.tmp`;
  await pipeline.toFile(tmp);
  await fs.rename(tmp, cacheAbs);
  return { file: cacheAbs, mime: isPng ? "image/png" : "image/jpeg" };
}
