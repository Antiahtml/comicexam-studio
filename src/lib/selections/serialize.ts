/** Serialización de selecciones (viñetas) para la API. */

export const selectionInclude = {
  page: { select: { index: true, width: true, height: true } },
  comic: { select: { title: true } },
} as const;

export function serializeSelection(s: {
  id: string;
  comicId: string;
  pageId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: Date;
  updatedAt: Date;
  page: { index: number; width: number; height: number };
  comic: { title: string };
}) {
  return {
    id: s.id,
    comicId: s.comicId,
    pageId: s.pageId,
    label: s.label,
    rect: { x: s.x, y: s.y, w: s.w, h: s.h },
    pageIndex: s.page.index,
    pageWidth: s.page.width,
    pageHeight: s.page.height,
    comicTitle: s.comic.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

