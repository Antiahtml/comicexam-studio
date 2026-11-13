import fs from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import yauzl from "yauzl";
import { z } from "zod";
import { prisma } from "../db";
import { dataPath, comicDir, removeComicFiles } from "../storage";
import { storeImage } from "../images/process";
import { parseDocument } from "../document/schema";
import type { ExamDocument, ImageSource } from "../document/types";
import { createProject, getProject, referencedPageIds } from "./repository";
import { config } from "../config";

/**
 * Formato de intercambio ".comicexam": un ZIP con
 *   - comicexam.json  → manifiesto (nombre, documento y lista de páginas)
 *   - pages/<n>.<ext> → imágenes originales de las páginas usadas
 */

const manifestSchema = z.object({
  format: z.literal("comicexam"),
  version: z.literal(1),
  name: z.string().max(200),
  document: z.unknown(),
  pages: z
    .array(
      z.object({
        id: z.string().max(64),
        comicId: z.string().max(64),
        comicTitle: z.string().max(300),
        index: z.number().int().min(0),
        file: z.string().regex(/^pages\/\d{1,5}\.(jpg|png|webp)$/),
      }),
    )
    .max(2000),
});

export async function exportProjectBundle(projectId: string): Promise<{ name: string; data: Uint8Array }> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  const ids = referencedPageIds(project.document);
  const pages = await prisma.comicPage.findMany({ where: { id: { in: ids } }, include: { comic: { select: { title: true } } } });
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const manifestPages = [];
  let n = 0;
  for (const p of pages) {
    const ext = p.mime === "image/png" ? "png" : p.mime === "image/webp" ? "webp" : "jpg";
    const file = `pages/${n++}.${ext}`;
    files[file] = [new Uint8Array(await fs.readFile(dataPath(p.path))), { level: 0 }];
    manifestPages.push({ id: p.id, comicId: p.comicId, comicTitle: p.comic.title, index: p.index, file });
  }
  const manifest = { format: "comicexam", version: 1, name: project.name, document: project.document, pages: manifestPages };
  files["comicexam.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return { name: project.name, data: zipSync(files) };
}

function readZipFromBuffer(buf: Buffer): Promise<Map<string, Buffer>> {
  const maxEntry = config.limits.maxEntryBytes;
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) return reject(new Error("El archivo no es un proyecto .comicexam válido."));
      const out = new Map<string, Buffer>();
      let total = 0;
      let count = 0;
      zip.on("entry", (entry: yauzl.Entry) => {
        if (++count > 2100) return reject(new Error("El proyecto contiene demasiados archivos."));
        if (entry.fileName.endsWith("/")) return zip.readEntry();
        if (entry.uncompressedSize > maxEntry) return reject(new Error("Un recurso del proyecto es demasiado grande."));
        total += entry.uncompressedSize;
        if (total > config.limits.maxTotalUncompressedBytes) return reject(new Error("El proyecto es demasiado grande."));
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(new Error("No se ha podido leer el proyecto."));
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("error", () => reject(new Error("El proyecto está dañado.")));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(out));
      zip.on("error", () => reject(new Error("El proyecto está dañado.")));
      zip.readEntry();
    });
  });
}

/** Importa un proyecto .comicexam: crea una colección con sus imágenes y remapea las referencias. */
export async function importProjectBundle(buf: Buffer): Promise<string> {
  const entries = await readZipFromBuffer(buf);
  const raw = entries.get("comicexam.json");
  if (!raw) throw new Error("Falta el archivo comicexam.json en el proyecto.");
  let manifest: z.infer<typeof manifestSchema>;
  try {
    manifest = manifestSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    throw new Error("El manifiesto del proyecto no es válido.");
  }
  const doc: ExamDocument = parseDocument(manifest.document);

  const comic = await prisma.comic.create({
    data: {
      title: `Recursos de «${manifest.name}»`,
      originalName: "proyecto.comicexam",
      format: "bundle",
      status: "processing",
      stage: "Importando proyecto…",
    },
  });
  const pageMap = new Map<string, { pageId: string; width: number; height: number }>();
  try {
    const relDir = path.join(comicDir(comic.id), "pages");
    let i = 0;
    for (const p of manifest.pages) {
      const data = entries.get(p.file);
      if (!data) throw new Error(`Falta la imagen ${p.file} en el proyecto.`);
      const stored = await storeImage(data, relDir, String(i + 1).padStart(4, "0"));
      const page = await prisma.comicPage.create({
        data: { comicId: comic.id, index: i, entryName: `${p.comicTitle} · pág. ${p.index + 1}`, ...stored },
      });
      pageMap.set(p.id, { pageId: page.id, width: stored.width, height: stored.height });
      i++;
    }
    await prisma.comic.update({ where: { id: comic.id }, data: { status: "ready", progress: 100, stage: "Listo", pageCount: i } });
  } catch (err) {
    await prisma.comic.delete({ where: { id: comic.id } }).catch(() => undefined);
    await removeComicFiles(comic.id).catch(() => undefined);
    throw err;
  }
  const remap = (src: ImageSource): ImageSource => {
    const m = pageMap.get(src.pageId);
    if (!m) return src;
    return { ...src, pageId: m.pageId, comicId: comic.id, selectionId: null, pageWidth: m.width, pageHeight: m.height };
  };
  for (const page of doc.pages)
    for (const el of page.elements) {
      if (el.type === "image") el.src = remap(el.src);
      if (el.type === "question" && el.image) el.image = remap(el.image);
    }
  if (pageMap.size === 0) await prisma.comic.delete({ where: { id: comic.id } }).catch(() => undefined);
  const project = await createProject(manifest.name, doc);
  return project.id;
}
