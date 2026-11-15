import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ExamDocument } from "../document/types";

/**
 * Base de datos local del navegador (IndexedDB). Los cómics, sus imágenes y los exámenes se
 * guardan SOLO en este navegador; nada se envía a ningún servidor.
 *
 * IMPORTANTE: el service worker (public/sw.js) abre la misma base de datos para servir las
 * imágenes. Si cambias el nombre, la versión o los almacenes, actualízalo también allí.
 */
export const DB_NAME = "comicexam-studio";
export const DB_VERSION = 1;

export type ComicFormat = "rar" | "zip" | "images" | "bundle";
export type ComicStatus = "processing" | "ready" | "error";

export interface ComicRecord {
  id: string;
  title: string;
  originalName: string;
  format: ComicFormat;
  status: ComicStatus;
  progress: number;
  stage: string;
  error: string | null;
  pageCount: number;
  sizeBytes: number;
  coverPageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageRecord {
  id: string;
  comicId: string;
  index: number;
  entryName: string;
  width: number;
  height: number;
  mime: string;
  bytes: number;
}

export interface SelectionRecord {
  id: string;
  comicId: string;
  pageId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  document: ExamDocument;
  createdAt: string;
  updatedAt: string;
}

export type BlobVariant = "original" | "thumb" | "preview";
export const blobKey = (pageId: string, variant: BlobVariant) => `${pageId}:${variant}`;

export interface ComicExamDB extends DBSchema {
  comics: { key: string; value: ComicRecord };
  pages: { key: string; value: PageRecord; indexes: { comicId: string } };
  /** Imágenes: clave "<pageId>:original|thumb|preview" → Blob */
  blobs: { key: string; value: Blob };
  selections: { key: string; value: SelectionRecord; indexes: { comicId: string; pageId: string } };
  projects: { key: string; value: ProjectRecord };
  /** Caché de recortes generados por el service worker (se puede vaciar). */
  crops: { key: string; value: Blob };
}

let dbPromise: Promise<IDBPDatabase<ComicExamDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ComicExamDB>> {
  dbPromise ??= openDB<ComicExamDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("comics")) db.createObjectStore("comics", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages", { keyPath: "id" }).createIndex("comicId", "comicId");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("selections")) {
        const s = db.createObjectStore("selections", { keyPath: "id" });
        s.createIndex("comicId", "comicId");
        s.createIndex("pageId", "pageId");
      }
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("crops")) db.createObjectStore("crops");
    },
    blocking() {
      // Otra pestaña necesita una versión nueva: se cierra esta conexión.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** Cierra la conexión abierta (pruebas, o antes de borrar la base de datos). */
export async function resetDBConnection(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p.catch(() => null))?.close();
}

export const nowIso = () => new Date().toISOString();
