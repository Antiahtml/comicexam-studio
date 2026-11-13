import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { dataPath } from "@/lib/storage";
import { processArchive } from "@/lib/comics/import";
import { cropImage } from "@/lib/images/process";
import { createProject, deleteProject, duplicateProject, getProject, listProjects, projectsUsingComic, saveProject } from "@/lib/projects/repository";
import { exportProjectBundle, importProjectBundle } from "@/lib/projects/bundle";
import { createImage, createLines, createQuestion, createPage } from "@/lib/document/factory";
import type { ImageSource } from "@/lib/document/types";

afterAll(async () => {
  await prisma.$disconnect();
});

async function importFixture(): Promise<string> {
  const comic = await prisma.comic.create({ data: { title: "Demo", originalName: "demo-comic.cbr", format: "rar" } });
  const tmp = path.join(config.dataDir, "tmp-test.cbr");
  await fs.copyFile(path.resolve(__dirname, "../../fixtures/demo-comic.cbr"), tmp);
  await processArchive(comic.id, tmp, "rar");
  return comic.id;
}

describe("importación completa de un CBR", () => {
  it("guarda las 48 páginas ordenadas, con originales y miniaturas", async () => {
    const id = await importFixture();
    const comic = await prisma.comic.findUniqueOrThrow({ where: { id }, include: { pages: { orderBy: { index: "asc" } } } });
    expect(comic.status).toBe("ready");
    expect(comic.pageCount).toBe(48);
    expect(comic.pages.map((p) => p.entryName.split("/").pop())).toEqual(Array.from({ length: 48 }, (_, i) => `pagina ${i + 1}.jpg`));
    const p12 = comic.pages[11];
    // Las rutas en disco las genera el servidor, nunca a partir del nombre del archivo
    expect(p12.path).toMatch(/comics[\\/]\w+[\\/]pages[\\/]0012\.jpg$/);
    const orig = await sharp(dataPath(p12.path)).metadata();
    const thumb = await sharp(dataPath(p12.thumbPath)).metadata();
    expect([orig.width, orig.height]).toEqual([1000, 1500]);
    expect(thumb.width).toBe(config.images.thumbWidth);
  });

  it("recorta las viñetas desde el original a resolución completa", async () => {
    const page = await prisma.comicPage.findFirstOrThrow({ where: { index: 11 } });
    const rect = { x: 0.25, y: 0.1, w: 0.5, h: 0.2 };
    const full = await cropImage(page.path, page.mime, page.width, page.height, rect, 0);
    const meta = await sharp(full.file).metadata();
    expect([meta.width, meta.height]).toEqual([500, 300]);
    const small = await cropImage(page.path, page.mime, page.width, page.height, rect, 200);
    expect((await sharp(small.file).metadata()).width).toBe(200);
  });

  it("marca como error un archivo que no es un cómic", async () => {
    const comic = await prisma.comic.create({ data: { title: "Malo", originalName: "x.cbz", format: "zip" } });
    const tmp = path.join(config.dataDir, "tmp-bad.cbz");
    await fs.writeFile(tmp, Buffer.from("PK\x03\x04 esto no es un zip"));
    await processArchive(comic.id, tmp, "zip");
    const after = await prisma.comic.findUniqueOrThrow({ where: { id: comic.id } });
    expect(after.status).toBe("error");
    expect(after.error).toBeTruthy();
    expect(await prisma.comicPage.count({ where: { comicId: comic.id } })).toBe(0);
  });
});

describe("persistencia y recuperación de proyectos", () => {
  it("guarda y recupera exactamente la posición, tamaño y propiedades de los elementos", async () => {
    const page = await prisma.comicPage.findFirstOrThrow({ where: { index: 19 }, include: { comic: true } });
    const src: ImageSource = {
      comicId: page.comicId,
      pageId: page.id,
      selectionId: null,
      crop: { x: 0.04, y: 0.03, w: 0.45, h: 0.31 },
      pageWidth: page.width,
      pageHeight: page.height,
      label: "Demo · pág. 20",
    };
    const project = await createProject("Comprensión lectora — Cómic");
    const doc = project.document;
    const img = createImage(src, 85, 100);
    img.x = 15.5;
    img.y = 70.2;
    img.rotation = -3;
    const q = createQuestion("long");
    q.prompt = "Compara las dos escenas.";
    q.points = 2.5;
    q.lines = 4;
    const lines = createLines(4);
    doc.pages[0].elements.push(img, q);
    const p2 = createPage();
    p2.elements.push(lines);
    doc.pages.push(p2);
    doc.settings.orientation = "landscape";
    doc.settings.margins.left = 22;
    await saveProject(project.id, { document: doc, name: "Examen final" });

    const loaded = await getProject(project.id);
    expect(loaded?.name).toBe("Examen final");
    expect(loaded?.document).toEqual(doc);
    const li = loaded!.document.pages[0].elements.find((e) => e.id === img.id)!;
    expect([li.x, li.y, li.w, li.h, li.rotation]).toEqual([15.5, 70.2, img.w, img.h, -3]);
    expect(loaded!.document.pages[1].elements[0]).toEqual(lines);
  });

  it("sabe qué exámenes usan un cómic (para avisar antes de borrarlo)", async () => {
    const page = await prisma.comicPage.findFirstOrThrow({ where: { index: 19 } });
    const users = await projectsUsingComic(page.comicId);
    expect(users.map((u) => u.name)).toContain("Examen final");
    expect(await projectsUsingComic("noexiste123")).toEqual([]);
  });

  it("lista, duplica y elimina proyectos", async () => {
    const before = (await listProjects()).length;
    const p = await createProject("Para duplicar");
    const copy = await duplicateProject(p.id);
    expect(copy.name).toBe("Para duplicar (copia)");
    expect(copy.document).toEqual(p.document);
    expect((await listProjects()).length).toBe(before + 2);
    await deleteProject(copy.id);
    expect(await getProject(copy.id)).toBeNull();
  });

  it("rechaza guardar un documento no válido", async () => {
    const p = await createProject("Validación");
    await expect(saveProject(p.id, { document: { version: 2 } })).rejects.toThrow();
    expect((await getProject(p.id))?.document.version).toBe(1);
  });

  it("exporta e importa un proyecto .comicexam con sus imágenes", async () => {
    const [proj] = (await listProjects()).filter((p) => p.name === "Examen final");
    const bundle = await exportProjectBundle(proj.id);
    expect(bundle.data.byteLength).toBeGreaterThan(10_000);
    const newId = await importProjectBundle(Buffer.from(bundle.data));
    const imported = await getProject(newId);
    const img = imported!.document.pages[0].elements.find((e) => e.type === "image");
    expect(img && img.type === "image" && img.src.pageId).not.toBe(undefined);
    if (img?.type !== "image") throw new Error("sin imagen");
    const page = await prisma.comicPage.findUniqueOrThrow({ where: { id: img.src.pageId } });
    expect(page.width).toBe(1000);
    await fs.access(dataPath(page.path));
  });
});
