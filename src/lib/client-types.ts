import type { NormRect } from "./regions/coords";
import type { ImageSource } from "./document/types";

/** Tipos de las respuestas de la API usados en el cliente. */

export interface ComicSummary {
  id: string;
  title: string;
  originalName: string;
  format: "rar" | "zip" | "images" | "bundle";
  status: "processing" | "ready" | "error";
  progress: number;
  stage: string;
  error: string | null;
  pageCount: number;
  sizeBytes: number;
  createdAt: string;
  coverPageId: string | null;
  selectionCount: number;
}

export interface PageInfo {
  id: string;
  index: number;
  entryName: string;
  width: number;
  height: number;
  mime: string;
  bytes: number;
}

export interface ComicDetail extends Omit<ComicSummary, "coverPageId" | "selectionCount"> {
  pages: PageInfo[];
}

export interface SavedSelection {
  id: string;
  comicId: string;
  pageId: string;
  label: string;
  rect: NormRect;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  comicTitle: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummaryDTO {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  elementCount: number;
  cover: ImageSource | null;
}

export function selectionToSource(s: SavedSelection): ImageSource {
  return {
    comicId: s.comicId,
    pageId: s.pageId,
    selectionId: s.id,
    crop: s.rect,
    pageWidth: s.pageWidth,
    pageHeight: s.pageHeight,
    label: `${s.comicTitle} · pàg. ${s.pageIndex + 1}`,
  };
}

export function pageToSource(comic: { id: string; title: string }, page: PageInfo, crop: NormRect = { x: 0, y: 0, w: 1, h: 1 }): ImageSource {
  return {
    comicId: comic.id,
    pageId: page.id,
    selectionId: null,
    crop,
    pageWidth: page.width,
    pageHeight: page.height,
    label: `${comic.title} · pàg. ${page.index + 1}`,
  };
}
