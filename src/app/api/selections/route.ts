import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, jsonError } from "@/lib/api";
import { clampRect, isValidRect } from "@/lib/regions/coords";
import { selectionInclude, serializeSelection } from "@/lib/selections/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Viñetas guardadas. Filtros opcionales: ?comicId=…&pageId=… */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const comicId = sp.get("comicId") || undefined;
  const pageId = sp.get("pageId") || undefined;
  const rows = await prisma.selection.findMany({
    where: { comicId, pageId },
    include: selectionInclude,
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(rows.map(serializeSelection));
});

const createSchema = z.object({
  pageId: z.string().min(1).max(64),
  label: z.string().max(200).optional(),
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
});

export const POST = handle(async (req: Request) => {
  const body = createSchema.parse(await req.json());
  const rect = clampRect(body.rect, 0.002);
  if (!isValidRect(rect)) return jsonError("La región seleccionada no es válida.");
  const page = await prisma.comicPage.findUnique({ where: { id: body.pageId }, select: { id: true, comicId: true, index: true } });
  if (!page) return jsonError("Página no encontrada", 404);
  const count = await prisma.selection.count({ where: { pageId: page.id } });
  const row = await prisma.selection.create({
    data: {
      comicId: page.comicId,
      pageId: page.id,
      label: body.label?.trim() || `Pág. ${page.index + 1} · viñeta ${count + 1}`,
      ...rect,
    },
    include: selectionInclude,
  });
  return NextResponse.json(serializeSelection(row), { status: 201 });
});
