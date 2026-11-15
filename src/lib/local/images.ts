import { detectImage, PASSTHROUGH_IMAGE } from "../archive/detect";
import { IMAGE_SIZES, LIMITS } from "../env";

/**
 * Procesamiento de imágenes en el navegador (en un worker): valida que la imagen es real y
 * decodificable, conserva el ORIGINAL intacto (para imprimir) y genera miniatura y vista previa.
 */

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export interface ProcessedImage {
  original: Blob;
  thumb: Blob;
  preview: Blob;
  mime: string;
  width: number;
  height: number;
}

async function resized(bitmap: ImageBitmap, maxWidth: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // las transparencias se ven sobre blanco, como en papel
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

export async function processImage(data: Uint8Array): Promise<ProcessedImage> {
  const kind = detectImage(data.subarray(0, 32));
  if (!kind) throw new ImageError("El archivo no es una imagen válida o su formato no es compatible.");
  const pass = PASSTHROUGH_IMAGE[kind];
  const mimeIn = pass?.mime ?? `image/${kind}`;
  const source = new Blob([data as BlobPart], { type: mimeIn });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new ImageError("La imagen está dañada o su formato no se puede abrir en este navegador.");
  }
  try {
    if (bitmap.width * bitmap.height > LIMITS.maxImagePixels) throw new ImageError("La imagen es demasiado grande.");
    // Se conserva el original (JPG/PNG/WebP). Otros formatos se convierten a PNG sin pérdida.
    let original: Blob = source;
    let mime = mimeIn;
    if (!pass) {
      const c = new OffscreenCanvas(bitmap.width, bitmap.height);
      c.getContext("2d")!.drawImage(bitmap, 0, 0);
      original = await c.convertToBlob({ type: "image/png" });
      mime = "image/png";
    }
    const [thumb, preview] = await Promise.all([resized(bitmap, IMAGE_SIZES.thumbWidth, 0.78), resized(bitmap, IMAGE_SIZES.previewWidth, 0.86)]);
    return { original, thumb, preview, mime, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
