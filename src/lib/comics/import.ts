import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db";
import { config } from "../config";
import { detectArchive, detectImage, type ArchiveKind } from "../archive/detect";
import { ArchiveError, extractArchiveImages, type PlannedEntry } from "../archive/extract";
import { naturalCompare } from "../archive/natural-sort";
import { displayName } from "../archive/safe-path";
import { ImageError, storeImage } from "../images/process";
import { comicDir, removeComicFiles } from "../storage";

/* ------------------------------------------------------------------ */
/* Cola de importación: un archivo cada vez para limitar memoria/CPU.  */
/* ------------------------------------------------------------------ */

interface QueueState {
  chain: Promise<void>;
  active: Set<string>;
}
const g = globalThis as unknown as { __comicImportQueue?: QueueState };
const queue: QueueState = (g.__comicImportQueue ??= { chain: Promise.resolve(), active: new Set() });

export function isImportActive(comicId: string): boolean {
  return queue.active.has(comicId);
}

export function enqueueImport(comicId: string, job: () => Promise<void>): Promise<void> {
  queue.active.add(comicId);
  const run = queue.chain.then(job).finally(() => queue.active.delete(comicId));
  queue.chain = run.catch(() => undefined);
  return run;
}

/** Título legible a partir del nombre del archivo subido. */
export function titleFromFileName(name: string): string {
  const base = displayName(name).replace(/\.(cbr|cbz|rar|zip|jpe?g|png|webp)$/i, "");
  return base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "Cómic sin título";
}

export async function sniffArchive(filePath: string): Promise<ArchiveKind | null> {
  const fh = await fs.open(filePath, "r");
  try {
    const head = Buffer.alloc(16);
    await fh.read(head, 0, 16, 0);
    return detectArchive(head);
  } finally {
    await fh.close();
  }
}

const pageName = (index: number) => String(index + 1).padStart(4, "0");

/**
 * Procesa un CBR/CBZ ya guardado en un archivo temporal: extrae, valida y guarda las páginas,
 * genera miniaturas y actualiza el progreso en base de datos.
 */
export async function processArchive(comicId: string, tempFile: string, kind: ArchiveKind): Promise<void> {
  const relDir = path.join(comicDir(comicId), "pages");
  let plan: PlannedEntry[] = [];
  let done = 0;
  let lastUpdate = 0;
  const stat = await fs.stat(tempFile);
  try {
    await prisma.comic.update({ where: { id: comicId }, data: { stage: "Analizando archivo…", progress: 2 } });
    await extractArchiveImages(
      tempFile,
      kind,
      {
        maxEntries: config.limits.maxEntries,
        maxEntryBytes: config.limits.maxEntryBytes,
        maxTotalBytes: config.limits.maxTotalUncompressedBytes,
        maxCompressionRatio: config.limits.maxCompressionRatio,
      },
      {
        onPlan: async (p) => {
          plan = p;
          await prisma.comic.update({
            where: { id: comicId },
            data: { stage: `Extrayendo ${p.length} páginas…`, progress: 5, pageCount: p.length },
          });
        },
        onEntry: async (entry, data) => {
          let stored;
          try {
            stored = await storeImage(data, relDir, pageName(entry.index));
          } catch (err) {
            const msg = err instanceof ImageError ? err.message : "error al procesar la imagen";
            throw new ArchiveError(`Página "${displayName(entry.name)}": ${msg}`);
          }
          await prisma.comicPage.create({
            data: {
              comicId,
              index: entry.index,
              entryName: entry.name,
              path: stored.path,
              thumbPath: stored.thumbPath,
              previewPath: stored.previewPath,
              mime: stored.mime,
              width: stored.width,
              height: stored.height,
              bytes: stored.bytes,
            },
          });
          done++;
          const now = Date.now();
          if (now - lastUpdate > 250 || done === plan.length) {
            lastUpdate = now;
            await prisma.comic.update({
              where: { id: comicId },
              data: {
                progress: Math.min(99, 5 + Math.round((done / Math.max(1, plan.length)) * 94)),
                stage: `Procesando página ${done} de ${plan.length}…`,
              },
            });
          }
        },
      },
    );
    const count = await prisma.comicPage.count({ where: { comicId } });
    await prisma.comic.update({
      where: { id: comicId },
      data: { status: "ready", progress: 100, stage: "Listo", pageCount: count, sizeBytes: stat.size },
    });
  } catch (err) {
    const message =
      err instanceof ArchiveError || err instanceof ImageError
        ? err.message
        : "Se ha producido un error inesperado al importar el archivo.";
    if (!(err instanceof ArchiveError)) console.error("[import]", err);
    await prisma.comicPage.deleteMany({ where: { comicId } }).catch(() => undefined);
    await removeComicFiles(comicId).catch(() => undefined);
    await prisma.comic
      .update({ where: { id: comicId }, data: { status: "error", error: message, stage: "Error", progress: 0, pageCount: 0 } })
      .catch(() => undefined);
  }
}

export interface IncomingImage {
  name: string;
  data: Buffer;
}

/** Importa imágenes sueltas (JPG, PNG, WebP) como una colección de la biblioteca. */
export async function importImageCollection(title: string, images: IncomingImage[]): Promise<string> {
  const valid = images.filter((i) => detectImage(i.data.subarray(0, 32)));
  if (valid.length === 0) throw new ImageError("Ninguno de los archivos es una imagen JPG, PNG o WebP válida.");
  const sorted = [...valid].sort((a, b) => naturalCompare(a.name, b.name));
  const comic = await prisma.comic.create({
    data: {
      title,
      originalName: sorted.length === 1 ? displayName(sorted[0].name) : `${sorted.length} imágenes`,
      format: "images",
      status: "processing",
      stage: "Procesando imágenes…",
      sizeBytes: sorted.reduce((s, i) => s + i.data.byteLength, 0),
    },
  });
  try {
    const relDir = path.join(comicDir(comic.id), "pages");
    for (let i = 0; i < sorted.length; i++) {
      const stored = await storeImage(sorted[i].data, relDir, pageName(i));
      await prisma.comicPage.create({
        data: { comicId: comic.id, index: i, entryName: displayName(sorted[i].name), ...stored },
      });
    }
    await prisma.comic.update({
      where: { id: comic.id },
      data: { status: "ready", progress: 100, stage: "Listo", pageCount: sorted.length },
    });
    return comic.id;
  } catch (err) {
    await prisma.comic.delete({ where: { id: comic.id } }).catch(() => undefined);
    await removeComicFiles(comic.id).catch(() => undefined);
    throw err;
  }
}

/** Marca como fallidas las importaciones que quedaron a medias (p. ej. tras reiniciar el servidor). */
export async function recoverStaleImports(): Promise<void> {
  const stale = await prisma.comic.findMany({ where: { status: "processing" }, select: { id: true, updatedAt: true } });
  for (const c of stale) {
    if (isImportActive(c.id)) continue;
    if (Date.now() - c.updatedAt.getTime() < 15_000) continue;
    await prisma.comicPage.deleteMany({ where: { comicId: c.id } });
    await removeComicFiles(c.id).catch(() => undefined);
    await prisma.comic.update({
      where: { id: c.id },
      data: { status: "error", error: "La importación se interrumpió. Vuelve a importar el archivo.", stage: "Error" },
    });
  }
}
