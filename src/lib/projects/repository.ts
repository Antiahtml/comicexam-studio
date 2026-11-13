import { prisma } from "../db";
import { createDefaultDocument, createImage, placeElement, createPage, findInsertPosition } from "../document/factory";
import { parseDocument } from "../document/schema";
import type { ExamDocument, ImageSource } from "../document/types";
import { printableArea } from "../document/units";

/** Capa de acceso a datos de los proyectos de examen. */

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  pageCount: number;
  elementCount: number;
  /** Primera imagen del documento (para la miniatura del dashboard). */
  cover: ImageSource | null;
}

export interface ProjectFull {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  document: ExamDocument;
}

function summarize(p: { id: string; name: string; createdAt: Date; updatedAt: Date; document: string }): ProjectSummary {
  let pageCount = 0;
  let elementCount = 0;
  let cover: ImageSource | null = null;
  try {
    const doc = JSON.parse(p.document) as ExamDocument;
    pageCount = doc.pages.length;
    for (const page of doc.pages) {
      elementCount += page.elements.length;
      for (const e of page.elements) {
        if (!cover && e.type === "image") cover = e.src;
      }
    }
  } catch {
    /* documento ilegible: se muestra igualmente */
  }
  return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, pageCount, elementCount, cover };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(summarize);
}

export async function getProject(id: string): Promise<ProjectFull | null> {
  const row = await prisma.project.findUnique({ where: { id } });
  if (!row) return null;
  return { id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt, document: parseDocument(JSON.parse(row.document)) };
}

export async function createProject(name: string, document?: ExamDocument): Promise<ProjectFull> {
  const clean = name.trim().slice(0, 200) || "Examen sin título";
  const doc = document ? parseDocument(document) : createDefaultDocument(clean);
  const row = await prisma.project.create({ data: { name: clean, document: JSON.stringify(doc) } });
  return { id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt, document: doc };
}

/** Guarda el documento completo (validado) y opcionalmente el nombre. */
export async function saveProject(id: string, data: { name?: string; document?: unknown }): Promise<{ updatedAt: Date }> {
  const update: { name?: string; document?: string } = {};
  if (data.name !== undefined) update.name = data.name.trim().slice(0, 200) || "Examen sin título";
  if (data.document !== undefined) update.document = JSON.stringify(parseDocument(data.document));
  const row = await prisma.project.update({ where: { id }, data: update });
  return { updatedAt: row.updatedAt };
}

export async function renameProject(id: string, name: string) {
  return saveProject(id, { name });
}

export async function duplicateProject(id: string): Promise<ProjectFull> {
  const src = await getProject(id);
  if (!src) throw new Error("Proyecto no encontrado");
  return createProject(`${src.name} (copia)`, src.document);
}

export async function deleteProject(id: string): Promise<void> {
  await prisma.project.delete({ where: { id } });
}

/** Ids de páginas de cómic usadas por un documento (imágenes y preguntas con imagen). */
export function referencedPageIds(doc: ExamDocument): string[] {
  const ids = new Set<string>();
  for (const p of doc.pages)
    for (const e of p.elements) {
      if (e.type === "image") ids.add(e.src.pageId);
      if (e.type === "question" && e.image) ids.add(e.image.pageId);
    }
  return [...ids];
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

/** Exámenes que muestran alguna imagen de un cómic (para avisar antes de borrarlo). */
export async function projectsUsingComic(comicId: string): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.project.findMany({ select: { id: true, name: true, document: true }, orderBy: { updatedAt: "desc" } });
  return rows
    .filter((r) => {
      // Comprobación rápida antes de analizar el JSON completo.
      if (!r.document.includes(comicId)) return false;
      try {
        return referencedComicIds(JSON.parse(r.document) as ExamDocument).includes(comicId);
      } catch {
        return false;
      }
    })
    .map((r) => ({ id: r.id, name: r.name }));
}

/** Inserta una imagen (página o viñeta) en la última hoja de un proyecto desde la biblioteca. */
export async function appendImageToProject(projectId: string, src: ImageSource): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  const doc = project.document;
  const area = printableArea(doc.settings);
  let page = doc.pages[doc.pages.length - 1];
  const el = createImage(src, area.w * 0.7, area.h * 0.45);
  // Si no cabe debajo del contenido existente, se crea una hoja nueva.
  if (!findInsertPosition(page, doc.settings, el.w, el.h).fits && page.elements.length > 0) {
    page = createPage();
    doc.pages.push(page);
  }
  placeElement(el, page, doc.settings);
  page.elements.push(el);
  await saveProject(projectId, { document: doc });
}
