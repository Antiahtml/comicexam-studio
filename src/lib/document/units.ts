import type { DocSettings, Orientation } from "./types";

/** Píxeles CSS por milímetro (CSS: 96 px = 1 in = 25,4 mm). */
export const PX_PER_MM = 96 / 25.4;
/** Puntos tipográficos por milímetro (72 pt = 25,4 mm). */
export const PT_PER_MM = 72 / 25.4;

export const A4 = { width: 210, height: 297 } as const;

export function pageSize(orientation: Orientation): { width: number; height: number } {
  return orientation === "landscape" ? { width: A4.height, height: A4.width } : { width: A4.width, height: A4.height };
}

export const mmToPx = (mm: number, zoom = 1) => mm * PX_PER_MM * zoom;
export const pxToMm = (px: number, zoom = 1) => px / (PX_PER_MM * zoom);
export const mmToPt = (mm: number) => mm * PT_PER_MM;
export const ptToMm = (pt: number) => pt / PT_PER_MM;

/** Redondea a décimas de milímetro para evitar ruido de coma flotante en el JSON. */
export const roundMm = (v: number) => Math.round(v * 10) / 10;

/** Zona imprimible (dentro de los márgenes). */
export function printableArea(settings: DocSettings) {
  const { width, height } = pageSize(settings.orientation);
  const m = settings.margins;
  return { x: m.left, y: m.top, w: width - m.left - m.right, h: height - m.top - m.bottom, pageW: width, pageH: height };
}
