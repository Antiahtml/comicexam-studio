import "fake-indexeddb/auto";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { blobKey, DB_NAME, getDB, resetDBConnection } from "@/lib/local/db";
import {
  appendImageToProject,
  ComicInUseError,
  createComicRecord,
  createProject,
  createSelection,
  deleteComic,
  deleteProject,
  deleteSelection,
  duplicateProject,
  getComic,
  getProject,
  listComics,
  listProjects,
  listSelections,
  projectsUsingComic,
  renameProject,
  saveProject,
  updateSelection,
} from "@/lib/local/repo";
import { exportProjectBundle, importProjectBundle, readBundle } from "@/lib/local/bundle";
import { createImage, createLines, createPage, createQuestion } from "@/lib/document/factory";
import type { ImageSource } from "@/lib/document/types";

/** Crea un cómic con páginas «procesadas» (sin worker: en Node no hay OffscreenCanvas). */
async function fakeComic(pages = 3) {
  const comic = await createComicRecord({ title: "Demo", originalName: "demo.cbr", format: "rar", sizeBytes: 1000 });
  const db = await getDB();
  const ids: string[] = [];
  for (let i = 0; i < pages; i++) {
    const id = `page${comic.id}${i}`;
    ids.push(id);
    await db.put("pages", { id, comicId: comic.id, index: i, entryName: `p${i + 1}.jpg`, width: 1000, height: 1500, mime: "image/jpeg", bytes: 4 });
    await db.put("blobs", new Blob([new Uint8Array([0xff, 0xd8, 0xff, i])], { type: "image/jpeg" }), blobKey(id, "original"));
  }
  await db.put("comics", { ...(await db.get("comics", comic.id))!, status: "ready", pageCount: pages, coverPageId: ids[0] });
  return { comicId: comic.id, pageIds: ids };
}

const src = (comicId: string, pageId: string): ImageSource => ({
  comicId,
  pageId,
  selectionId: null,
  crop: { x: 0.04, y: 0.03, w: 0.45, h: 0.31 },
  pageWidth: 1000,
  pageHeight: 1500,
  label: "Demo · pág. 1",
});

beforeEach(async () => {
  // Base de datos vacía en cada prueba
  await resetDBConnection();
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => resolve();
  });
});

describe("persistencia y recuperación de exámenes (IndexedDB)", () => {
  it("guarda y recupera exactamente posición, tamaño y propiedades de los elementos", async () => {
    const { comicId, pageIds } = await fakeComic();
    const { id } = await createProject("Comprensión lectora — Cómic");
    const doc = (await getProject(id))!.document;
    const img = createImage(src(comicId, pageIds[0]), 85, 100);
    img.x = 15.5;
    img.y = 70.2;
    img.rotation = -3;
    const q = createQuestion("long");
    q.prompt = "Compara las dos escenas.";
    q.points = 2.5;
    const p2 = createPage();
    p2.elements.push(createLines(4));
    doc.pages[0].elements.push(img, q);
    doc.pages.push(p2);
    doc.settings.orientation = "landscape";
    await saveProject(id, { document: doc, name: "Examen final" });
    // Se simula reabrir la aplicación: nueva conexión a la base de datos
    await resetDBConnection();
    const loaded = await getProject(id);
    expect(loaded?.document).toEqual(doc);
    expect((await listProjects())[0]).toMatchObject({ name: "Examen final", pageCount: 2, elementCount: 4 });
  });

  it("rechaza guardar un documento no válido sin perder el anterior", async () => {
    const { id } = await createProject("Validación");
    await expect(saveProject(id, { document: { version: 2 } })).rejects.toThrow(/no válidos/);
    expect((await getProject(id))?.document.version).toBe(1);
  });

  it("cambia el nombre, duplica y elimina", async () => {
    const { id } = await createProject("Original");
    await renameProject(id, "  Renombrado ");
    const copy = await duplicateProject(id);
    expect(copy.name).toBe("Renombrado (copia)");
    expect((await getProject(copy.id))?.document).toEqual((await getProject(id))?.document);
    await deleteProject(copy.id);
    expect(await getProject(copy.id)).toBeNull();
    expect((await listProjects()).map((p) => p.name)).toEqual(["Renombrado"]);
  });

  it("añade una viñeta desde el visor al final del examen (y crea hoja si no cabe)", async () => {
    const { comicId, pageIds } = await fakeComic();
    const { id } = await createProject("Con viñetas");
    for (let i = 0; i < 4; i++) await appendImageToProject(id, src(comicId, pageIds[0]));
    const doc = (await getProject(id))!.document;
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(doc.pages.flatMap((p) => p.elements).filter((e) => e.type === "image")).toHaveLength(4);
  });
});

describe("biblioteca: viñetas y borrado seguro", () => {
  it("guarda, edita y borra viñetas con coordenadas normalizadas", async () => {
    const { comicId, pageIds } = await fakeComic();
    const s = await createSelection({ pageId: pageIds[1], rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
    expect(s).toMatchObject({ comicId, pageIndex: 1, label: "Pág. 2 · viñeta 1", rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
    const moved = await updateSelection(s.id, { rect: { x: 0.95, y: 0, w: 0.3, h: 0.4 } });
    expect(moved.rect.x + moved.rect.w).toBeLessThanOrEqual(1);
    expect(await listSelections({ comicId })).toHaveLength(1);
    await deleteSelection(s.id);
    expect(await listSelections()).toHaveLength(0);
  });

  it("no borra un cómic usado en un examen sin confirmación, y al borrarlo limpia todo", async () => {
    const { comicId, pageIds } = await fakeComic();
    await createSelection({ pageId: pageIds[0], rect: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    const { id } = await createProject("Usa el cómic");
    await appendImageToProject(id, src(comicId, pageIds[0]));
    expect(await projectsUsingComic(comicId)).toEqual([{ id, name: "Usa el cómic" }]);
    await expect(deleteComic(comicId)).rejects.toBeInstanceOf(ComicInUseError);
    expect(await getComic(comicId)).not.toBeNull();
    await deleteComic(comicId, { force: true });
    expect(await getComic(comicId)).toBeNull();
    expect(await listComics()).toEqual([]);
    expect(await listSelections()).toEqual([]);
    const db = await getDB();
    expect(await db.get("blobs", blobKey(pageIds[0], "original"))).toBeUndefined();
  });
});

describe("exportar e importar exámenes (.comicexam)", () => {
  it("exporta el examen con sus imágenes y lo vuelve a importar con las referencias actualizadas", async () => {
    const { comicId, pageIds } = await fakeComic();
    const { id } = await createProject("Para llevar");
    await appendImageToProject(id, src(comicId, pageIds[2]));
    const bundle = await exportProjectBundle(id);
    const { manifest } = readBundle(bundle.data);
    expect(manifest.pages).toHaveLength(1);

    const imported: { title: string; count: number }[] = [];
    const newId = await importProjectBundle(bundle.data, async (title, files) => {
      // Sustituye al worker: registra las páginas recibidas
      imported.push({ title, count: files.length });
      const c = await fakeComic(files.length);
      return { comicId: c.comicId, pageIds: c.pageIds };
    });
    expect(imported).toEqual([{ title: "Recursos de «Para llevar»", count: 1 }]);
    const doc = (await getProject(newId))!.document;
    const img = doc.pages.flatMap((p) => p.elements).find((e) => e.type === "image");
    expect(img?.type === "image" && img.src.pageId).not.toBe(pageIds[2]);
  });

  it("importa los .comicexam de la versión anterior (con servidor)", async () => {
    const bytes = new Uint8Array(await fs.readFile(path.resolve(__dirname, "../../public/ejemplo.comicexam")));
    const { manifest, document } = readBundle(bytes);
    expect(manifest.name).toBe("Comprensión lectora — Cómic (ejemplo)");
    expect(document.pages).toHaveLength(2);
    expect(manifest.pages.length).toBeGreaterThan(0);
  });

  it("rechaza archivos que no son proyectos", () => {
    expect(() => readBundle(new TextEncoder().encode("hola"))).toThrow(/no es un proyecto/);
  });
});
