import { nanoid } from "nanoid";
import { blobKey, getDB, nowIso, type ComicRecord, type PageRecord, type SelectionRecord } from "./db";
import { createDefaultDocument, createImage, createPage, findInsertPosition, placeElement } from "../document/factory";
import { parseDocument, safeParseDocument } from "../document/schema";
import type { ExamDocument, ImageSource } from "../document/types";
import { printableArea } from "../document/units";
import { clampRect, isValidRect, type NormRect } from "../regions/coords";
import type { ComicDetail, ComicSummary, ProjectSummaryDTO, SavedSelection } from "../client-types";

/**
 * Operaciones sobre los datos locales (sustituyen a la API del servidor de la versión anterior).
 * Todas trabajan contra IndexedDB en el propio navegador.
 */

export const newId = () => nanoid(16);

/** Aviso de cambios para que las listas abiertas se actualicen (también entre pestañas). */
const CHANNEL = "comicexam-data";
let channel: BroadcastChannel | null = null;
export function notifyChange(kind: "comics" | "selections" | "projects") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`${CHANNEL}:${kind}`));
  try {
    channel ??= new BroadcastChannel(CHANNEL);
    channel.postMessage(kind);
  } catch {
    /* BroadcastChannel no disponible */
  }
}
export function onDataChange(kind: "comics" | "selections" | "projects", fn: () => void): () => void {
  const handler = () => fn();
  window.addEventListener(`${CHANNEL}:${kind}`, handler);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => e.data === kind && fn();
  } catch {
    /* sin BroadcastChannel */
  }
  return () => {
    window.removeEventListener(`${CHANNEL}:${kind}`, handler);
    bc?.close();
  };
}

/* --------------------------------- Cómics --------------------------------- */

export async function listComics(): Promise<ComicSummary[]> {
  const db = await getDB();
  const [comics, selections] = await Promise.all([db.getAll("comics"), db.getAll("selections")]);
  const count = new Map<string, number>();
  for (const s of selections) count.set(s.comicId, (count.get(s.comicId) ?? 0) + 1);
  return comics
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => ({
      id: c.id,
      title: c.title,
      originalName: c.originalName,
      format: c.format,
      status: c.status,
      progress: c.progress,
      stage: c.stage,
      error: c.error,
      pageCount: c.pageCount,
      sizeBytes: c.sizeBytes,
      createdAt: c.createdAt,
      coverPageId: c.coverPageId,
      selectionCount: count.get(c.id) ?? 0,
    }));
}

export async function getComic(id: string): Promise<ComicDetail | null> {
  const db = await getDB();
  const c = await db.get("comics", id);
  if (!c) return null;
  const pages = (await db.getAllFromIndex("pages", "comicId", id)).sort((a, b) => a.index - b.index);
  return {
    id: c.id,
    title: c.title,
    originalName: c.originalName,
    format: c.format,
    status: c.status,
    progress: c.progress,
    stage: c.stage,
    error: c.error,
    pageCount: c.pageCount,
    sizeBytes: c.sizeBytes,
    createdAt: c.createdAt,
    pages: pages.map(({ id, index, entryName, width, height, mime, bytes }) => ({ id, index, entryName, width, height, mime, bytes })),
  };
}

export async function createComicRecord(data: Pick<ComicRecord, "title" | "originalName" | "format" | "sizeBytes">): Promise<ComicRecord> {
  const db = await getDB();
  const rec: ComicRecord = {
    id: newId(),
    ...data,
    status: "processing",
    progress: 0,
    stage: "En cua…",
    error: null,
    pageCount: 0,
    coverPageId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db.put("comics", rec);
  notifyChange("comics");
  return rec;
}

export async function renameComic(id: string, title: string): Promise<void> {
  const db = await getDB();
  const c = await db.get("comics", id);
  if (!c) throw new Error("Còmic no trobat");
  await db.put("comics", { ...c, title: title.trim().slice(0, 160) || c.title, updatedAt: nowIso() });
  notifyChange("comics");
}

/** Borra las páginas, imágenes, recortes y viñetas de un cómic (deja el registro del cómic). */
export async function deleteComicContent(comicId: string): Promise<void> {
  const db = await getDB();
  const pages = await db.getAllFromIndex("pages", "comicId", comicId);
  const sels = await db.getAllKeysFromIndex("selections", "comicId", comicId);
  const tx = db.transaction(["pages", "blobs", "crops", "selections"], "readwrite");
  for (const p of pages) {
    void tx.objectStore("pages").delete(p.id);
    for (const v of ["original", "thumb", "preview"] as const) void tx.objectStore("blobs").delete(blobKey(p.id, v));
    void tx.objectStore("crops").delete(IDBKeyRange.bound(`${p.id}:`, `${p.id}:￿`));
  }
  for (const k of sels) void tx.objectStore("selections").delete(k);
  await tx.done;
}

export class ComicInUseError extends Error {
  constructor(public usedBy: { id: string; name: string }[]) {
    super(`Aquest còmic s'utilitza en ${usedBy.length} examen(s).`);
  }
}

export async function deleteComic(id: string, opts: { force?: boolean } = {}): Promise<void> {
  const usedBy = await projectsUsingComic(id);
  if (usedBy.length && !opts.force) throw new ComicInUseError(usedBy);
  await deleteComicContent(id);
  const db = await getDB();
  await db.delete("comics", id);
  notifyChange("comics");
  notifyChange("selections");
}

export async function getPage(id: string): Promise<PageRecord | undefined> {
  return (await getDB()).get("pages", id);
}

/* --------------------------------- Viñetas --------------------------------- */

async function serialize(s: SelectionRecord): Promise<SavedSelection | null> {
  const db = await getDB();
  const [page, comic] = await Promise.all([db.get("pages", s.pageId), db.get("comics", s.comicId)]);
  if (!page || !comic) return null;
  return {
    id: s.id,
    comicId: s.comicId,
    pageId: s.pageId,
    label: s.label,
    rect: { x: s.x, y: s.y, w: s.w, h: s.h },
    pageIndex: page.index,
    pageWidth: page.width,
    pageHeight: page.height,
    comicTitle: comic.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export async function listSelections(filter: { comicId?: string; pageId?: string } = {}): Promise<SavedSelection[]> {
  const db = await getDB();
  const rows = filter.pageId
    ? await db.getAllFromIndex("selections", "pageId", filter.pageId)
    : filter.comicId
      ? await db.getAllFromIndex("selections", "comicId", filter.comicId)
      : await db.getAll("selections");
  const out = (await Promise.all(rows.map(serialize))).filter(Boolean) as SavedSelection[];
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function validRect(rect: NormRect): NormRect {
  const r = clampRect(rect, 0.002);
  if (!isValidRect(r)) throw new Error("La regió seleccionada no és vàlida.");
  return r;
}

export async function createSelection(input: { pageId: string; rect: NormRect; label?: string }): Promise<SavedSelection> {
  const db = await getDB();
  const page = await db.get("pages", input.pageId);
  if (!page) throw new Error("Pàgina no trobada");
  const count = (await db.getAllKeysFromIndex("selections", "pageId", page.id)).length;
  const rect = validRect(input.rect);
  const rec: SelectionRecord = {
    id: newId(),
    comicId: page.comicId,
    pageId: page.id,
    label: input.label?.trim().slice(0, 200) || `Pàg. ${page.index + 1} · vinyeta ${count + 1}`,
    ...rect,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db.put("selections", rec);
  notifyChange("selections");
  return (await serialize(rec))!;
}

export async function updateSelection(id: string, patch: { label?: string; rect?: NormRect }): Promise<SavedSelection> {
  const db = await getDB();
  const s = await db.get("selections", id);
  if (!s) throw new Error("Vinyeta no trobada");
  const next: SelectionRecord = { ...s, updatedAt: nowIso() };
  if (patch.label !== undefined) next.label = patch.label.trim().slice(0, 200);
  if (patch.rect) Object.assign(next, validRect(patch.rect));
  await db.put("selections", next);
  notifyChange("selections");
  return (await serialize(next))!;
}

export async function deleteSelection(id: string): Promise<void> {
  await (await getDB()).delete("selections", id);
  notifyChange("selections");
}

/* --------------------------------- Exámenes --------------------------------- */

function summarize(p: { id: string; name: string; createdAt: string; updatedAt: string; document: ExamDocument }): ProjectSummaryDTO {
  let elementCount = 0;
  let cover: ImageSource | null = null;
  for (const page of p.document.pages) {
    elementCount += page.elements.length;
    for (const e of page.elements) if (!cover && e.type === "image") cover = e.src;
  }
  return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, pageCount: p.document.pages.length, elementCount, cover };
}

export async function listProjects(): Promise<ProjectSummaryDTO[]> {
  const rows = await (await getDB()).getAll("projects");
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summarize);
}

export async function getProject(id: string): Promise<{ id: string; name: string; document: ExamDocument; updatedAt: string } | null> {
  const p = await (await getDB()).get("projects", id);
  if (!p) return null;
  return { id: p.id, name: p.name, document: parseDocument(p.document), updatedAt: p.updatedAt };
}

export async function createProject(name: string, document?: ExamDocument): Promise<{ id: string; name: string }> {
  const clean = name.trim().slice(0, 200) || "Examen sense títol";
  const doc = document ? parseDocument(document) : createDefaultDocument(clean);
  const rec = { id: newId(), name: clean, document: doc, createdAt: nowIso(), updatedAt: nowIso() };
  await (await getDB()).put("projects", rec);
  notifyChange("projects");
  return { id: rec.id, name: rec.name };
}

/** Guarda el documento (validado) y opcionalmente el nombre. */
export async function saveProject(id: string, data: { name?: string; document?: unknown }): Promise<{ updatedAt: string }> {
  const db = await getDB();
  const p = await db.get("projects", id);
  if (!p) throw new Error("L'examen no existeix (s'ha esborrat en una altra pestanya?).");
  const next = { ...p, updatedAt: nowIso() };
  if (data.name !== undefined) next.name = data.name.trim().slice(0, 200) || "Examen sense títol";
  if (data.document !== undefined) {
    const parsed = safeParseDocument(data.document);
    if (!parsed.ok) throw new Error("No s'ha pogut desar: el document té dades no vàlides.");
    next.document = parsed.doc;
  }
  await db.put("projects", next);
  notifyChange("projects");
  return { updatedAt: next.updatedAt };
}

export async function renameProject(id: string, name: string) {
  return saveProject(id, { name });
}

export async function duplicateProject(id: string): Promise<{ id: string; name: string }> {
  const p = await getProject(id);
  if (!p) throw new Error("Examen no trobat");
  return createProject(`${p.name} (copia)`, p.document);
}

export async function deleteProject(id: string): Promise<void> {
  await (await getDB()).delete("projects", id);
  notifyChange("projects");
}

/** Ids de cómics usados por un documento. */
export function referencedComicIds(doc: ExamDocument): string[] {
  const ids = new Set<string>();
  for (const p of doc.pages)
    for (const e of p.elements) {
      if (e.type === "image") ids.add(e.src.comicId);
      if (e.type === "question" && e.image) ids.add(e.image.comicId);
    }
  return [...ids];
}

/** Ids de páginas de cómic usadas por un documento. */
export function referencedPageIds(doc: ExamDocument): string[] {
  const ids = new Set<string>();
  for (const p of doc.pages)
    for (const e of p.elements) {
      if (e.type === "image") ids.add(e.src.pageId);
      if (e.type === "question" && e.image) ids.add(e.image.pageId);
    }
  return [...ids];
}

export async function projectsUsingComic(comicId: string): Promise<{ id: string; name: string }[]> {
  const rows = await (await getDB()).getAll("projects");
  return rows
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((p) => referencedComicIds(p.document).includes(comicId))
    .map((p) => ({ id: p.id, name: p.name }));
}

/** Inserta una imagen (página o viñeta) en la última hoja de un examen, desde el visor de la biblioteca. */
export async function appendImageToProject(projectId: string, src: ImageSource): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Examen no trobat");
  const doc = project.document;
  const area = printableArea(doc.settings);
  let page = doc.pages[doc.pages.length - 1];
  const el = createImage(src, area.w * 0.7, area.h * 0.45);
  if (!findInsertPosition(page, doc.settings, el.w, el.h).fits && page.elements.length > 0) {
    page = createPage();
    doc.pages.push(page);
  }
  placeElement(el, page, doc.settings);
  page.elements.push(el);
  await saveProject(projectId, { document: doc });
}

/** Espacio usado por la aplicación en este navegador. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

/** Pide al navegador que no borre los datos aunque falte espacio. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
