import type { ImageSource } from "../document/types";
import type { NormRect } from "../regions/coords";
import { withBase } from "../env";

/** URLs de imágenes. Las sirve el service worker (public/sw.js) desde la base de datos del navegador. */

export type PageVariant = "thumb" | "preview" | "original";

export function pageImageUrl(pageId: string, variant: PageVariant = "preview"): string {
  return withBase(`/media/page/${encodeURIComponent(pageId)}?v=${variant}`);
}

const r4 = (n: number) => Math.round(n * 1e5) / 1e5;

export function isFullRect(r: NormRect): boolean {
  return r.x <= 0.0001 && r.y <= 0.0001 && r.w >= 0.9999 && r.h >= 0.9999;
}

/**
 * URL del recorte de una página.
 * - "screen": versión reducida para el editor (rápida).
 * - "print": recorte a resolución ORIGINAL para el PDF.
 */
export function cropUrl(pageId: string, rect: NormRect, quality: "screen" | "print" | "thumb" = "screen"): string {
  if (quality === "thumb" && isFullRect(rect)) return pageImageUrl(pageId, "thumb");
  if (quality === "screen" && isFullRect(rect)) return pageImageUrl(pageId, "preview");
  if (quality === "print" && isFullRect(rect)) return pageImageUrl(pageId, "original");
  const max = quality === "print" ? 0 : quality === "thumb" ? 360 : 1400;
  const r = [rect.x, rect.y, rect.w, rect.h].map(r4).join(",");
  return withBase(`/media/crop/${encodeURIComponent(pageId)}?r=${r}&max=${max}`);
}

export function sourceUrl(src: ImageSource, quality: "screen" | "print" | "thumb" = "screen"): string {
  return cropUrl(src.pageId, src.crop, quality);
}
