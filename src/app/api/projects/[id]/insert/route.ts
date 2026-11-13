import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, jsonError } from "@/lib/api";
import { appendImageToProject } from "@/lib/projects/repository";
import { clampRect, FULL_RECT } from "@/lib/regions/coords";

export const runtime = "nodejs";

const schema = z.object({
  pageId: z.string().min(1).max(64),
  selectionId: z.string().max(64).nullable().optional(),
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
});

/** Añade una página o viñeta de la biblioteca a la última hoja de un examen (desde el visor). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = schema.parse(await req.json());
  const page = await prisma.comicPage.findUnique({ where: { id: body.pageId }, include: { comic: { select: { title: true } } } });
  if (!page) return jsonError("Página no encontrada", 404);
  await appendImageToProject(id, {
    comicId: page.comicId,
    pageId: page.id,
    selectionId: body.selectionId ?? null,
    crop: body.rect ? clampRect(body.rect, 0.002) : FULL_RECT,
    pageWidth: page.width,
    pageHeight: page.height,
    label: `${page.comic.title} · pág. ${page.index + 1}`,
  });
  return NextResponse.json({ ok: true });
});
