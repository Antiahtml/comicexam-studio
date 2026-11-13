import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ID_RE, jsonError } from "@/lib/api";
import { removeComicFiles } from "@/lib/storage";
import { isImportActive } from "@/lib/comics/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Detalle del cómic con sus páginas (y selecciones si se pide ?selections=1). */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("Identificador no válido", 400);
  const comic = await prisma.comic.findUnique({
    where: { id },
    include: {
      pages: {
        orderBy: { index: "asc" },
        select: { id: true, index: true, entryName: true, width: true, height: true, mime: true, bytes: true },
      },
    },
  });
  if (!comic) return jsonError("Cómic no encontrado", 404);
  return NextResponse.json({
    id: comic.id,
    title: comic.title,
    originalName: comic.originalName,
    format: comic.format,
    status: comic.status,
    progress: comic.progress,
    stage: comic.stage,
    error: comic.error,
    pageCount: comic.pageCount,
    sizeBytes: comic.sizeBytes,
    createdAt: comic.createdAt,
    pages: comic.pages,
  });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = z.object({ title: z.string().trim().min(1).max(160) }).parse(await req.json());
  await prisma.comic.update({ where: { id }, data: { title: body.title } });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("Identificador no válido", 400);
  if (isImportActive(id)) return jsonError("El cómic se está importando todavía. Espera a que termine.", 409);
  await prisma.comic.delete({ where: { id } });
  await removeComicFiles(id);
  return NextResponse.json({ ok: true });
});
