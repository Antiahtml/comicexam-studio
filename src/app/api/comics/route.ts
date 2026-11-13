import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { handle, jsonError } from "@/lib/api";
import { createTempWorkspace } from "@/lib/storage";
import { enqueueImport, processArchive, recoverStaleImports, sniffArchive, titleFromFileName } from "@/lib/comics/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista de cómics de la biblioteca. */
export const GET = handle(async () => {
  await recoverStaleImports();
  const comics = await prisma.comic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      pages: { where: { index: 0 }, select: { id: true } },
      _count: { select: { selections: true } },
    },
  });
  return NextResponse.json(
    comics.map((c) => ({
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
      coverPageId: c.pages[0]?.id ?? null,
      selectionCount: c._count.selections,
    })),
  );
});

/**
 * Subida de un CBR/CBZ. El cuerpo es el archivo binario (no multipart) para poder
 * escribirlo en disco en streaming sin cargarlo entero en memoria.
 * El nombre original llega en la cabecera X-File-Name (codificado con encodeURIComponent).
 */
export const POST = handle(async (req: Request) => {
  if (!req.body) return jsonError("No se ha recibido ningún archivo.");
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > config.limits.maxUploadBytes) {
    return jsonError(`El archivo supera el tamaño máximo permitido (${Math.round(config.limits.maxUploadBytes / 1048576)} MB).`, 413);
  }
  let originalName = "comic.cbr";
  try {
    originalName = decodeURIComponent(req.headers.get("x-file-name") || originalName).slice(0, 300);
  } catch {
    /* nombre mal codificado: se usa el genérico */
  }

  // Cada subida se guarda en un directorio temporal aislado con un nombre generado.
  const ws = await createTempWorkspace("upload");
  const tempFile = path.join(ws.dir, "archive.bin");
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > config.limits.maxUploadBytes) cb(new Error("LIMIT"));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), limiter, fs.createWriteStream(tempFile));
  } catch (err) {
    await ws.cleanup();
    if ((err as Error).message === "LIMIT") return jsonError("El archivo supera el tamaño máximo permitido.", 413);
    return jsonError("La subida del archivo se ha interrumpido.", 400);
  }

  const kind = await sniffArchive(tempFile);
  if (!kind) {
    await ws.cleanup();
    return jsonError("El archivo no es un CBR/CBZ válido (no se reconoce como RAR ni ZIP).", 415);
  }
  const stat = await fsp.stat(tempFile);
  const comic = await prisma.comic.create({
    data: {
      title: titleFromFileName(originalName),
      originalName,
      format: kind,
      status: "processing",
      stage: "En cola…",
      progress: 1,
      sizeBytes: stat.size,
    },
  });
  // El procesamiento continúa después de responder; el cliente consulta el progreso.
  const job = enqueueImport(comic.id, async () => {
    try {
      await processArchive(comic.id, tempFile, kind);
    } finally {
      await ws.cleanup();
    }
  });
  after(() => job.catch(() => undefined));
  return NextResponse.json({ id: comic.id, status: comic.status }, { status: 202 });
});
