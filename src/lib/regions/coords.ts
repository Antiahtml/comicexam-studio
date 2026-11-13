/**
 * Sistema de coordenadas de las selecciones de viñetas.
 *
 * Todas las selecciones se guardan NORMALIZADAS respecto a la imagen original:
 * x, y, w, h ∈ [0, 1]. Así son independientes del zoom y de la resolución con la
 * que se muestre la página (miniatura, previsualización u original).
 */

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const MIN_REGION = 0.01;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Convierte un punto en píxeles de pantalla a coordenadas normalizadas de la imagen mostrada. */
export function clientToNormalized(clientX: number, clientY: number, box: ClientBox): Point {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - box.left) / box.width),
    y: clamp01((clientY - box.top) / box.height),
  };
}

/** Convierte un rectángulo normalizado a la caja que ocupa en pantalla. */
export function normalizedToClient(rect: NormRect, box: ClientBox): ClientBox {
  return {
    left: box.left + rect.x * box.width,
    top: box.top + rect.y * box.height,
    width: rect.w * box.width,
    height: rect.h * box.height,
  };
}

/** Rectángulo a partir de dos esquinas cualesquiera (arrastre en cualquier dirección). */
export function rectFromPoints(a: Point, b: Point): NormRect {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Garantiza que el rectángulo está dentro de [0,1] y tiene un tamaño mínimo. */
export function clampRect(r: NormRect, min = MIN_REGION): NormRect {
  const w = Math.min(1, Math.max(min, r.w));
  const h = Math.min(1, Math.max(min, r.h));
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

/** Desplaza el rectángulo sin cambiar su tamaño y sin salirse de la imagen. */
export function moveRect(r: NormRect, dx: number, dy: number): NormRect {
  return {
    ...r,
    x: Math.min(1 - r.w, Math.max(0, r.x + dx)),
    y: Math.min(1 - r.h, Math.max(0, r.y + dy)),
  };
}

/** Redimensiona arrastrando un tirador (esquina o lado). Los deltas están normalizados. */
export function resizeRect(r: NormRect, handle: Handle, dx: number, dy: number, min = MIN_REGION): NormRect {
  let x1 = r.x;
  let y1 = r.y;
  let x2 = r.x + r.w;
  let y2 = r.y + r.h;
  if (handle.includes("w")) x1 = Math.min(x2 - min, Math.max(0, x1 + dx));
  if (handle.includes("e")) x2 = Math.max(x1 + min, Math.min(1, x2 + dx));
  if (handle.includes("n")) y1 = Math.min(y2 - min, Math.max(0, y1 + dy));
  if (handle.includes("s")) y2 = Math.max(y1 + min, Math.min(1, y2 + dy));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Convierte un rectángulo normalizado a una caja de recorte en píxeles enteros de la imagen
 * original (para Sharp). Se redondea hacia fuera para no perder ningún píxel de la viñeta y se
 * limita a los bordes de la imagen.
 */
export function normalizedToPixels(rect: NormRect, imgW: number, imgH: number) {
  // Tolerancia para errores de coma flotante (0.1 + 0.2 = 0.30000000000000004).
  const EPS = 1e-6;
  const left = Math.max(0, Math.floor(rect.x * imgW + EPS));
  const top = Math.max(0, Math.floor(rect.y * imgH + EPS));
  const right = Math.min(imgW, Math.ceil((rect.x + rect.w) * imgW - EPS));
  const bottom = Math.min(imgH, Math.ceil((rect.y + rect.h) * imgH - EPS));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Rectángulo normalizado a partir de una caja en píxeles de la imagen original. */
export function pixelsToNormalized(box: { left: number; top: number; width: number; height: number }, imgW: number, imgH: number): NormRect {
  return clampRect({ x: box.left / imgW, y: box.top / imgH, w: box.width / imgW, h: box.height / imgH }, 0);
}

export function isValidRect(r: unknown): r is NormRect {
  if (!r || typeof r !== "object") return false;
  const { x, y, w, h } = r as NormRect;
  return [x, y, w, h].every((v) => typeof v === "number" && Number.isFinite(v)) && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.000001 && y + h <= 1.000001;
}

export const FULL_RECT: NormRect = { x: 0, y: 0, w: 1, h: 1 };

/** Relación de aspecto real (ancho/alto) del recorte en la imagen original. */
export function cropAspect(rect: NormRect, imgW: number, imgH: number): number {
  return (rect.w * imgW) / (rect.h * imgH);
}
