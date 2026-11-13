import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, jsonError } from "@/lib/api";
import { clampRect, isValidRect } from "@/lib/regions/coords";
import { serializeSelection } from "@/lib/selections/serialize";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  label: z.string().max(200).optional(),
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = patchSchema.parse(await req.json());
  const data: { label?: string; x?: number; y?: number; w?: number; h?: number } = {};
  if (body.label !== undefined) data.label = body.label.trim();
  if (body.rect) {
    const rect = clampRect(body.rect, 0.002);
    if (!isValidRect(rect)) return jsonError("La región seleccionada no es válida.");
    Object.assign(data, rect);
  }
  const row = await prisma.selection.update({
    where: { id },
    data,
    include: { page: { select: { index: true, width: true, height: true } }, comic: { select: { title: true } } },
  });
  return NextResponse.json(serializeSelection(row));
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await prisma.selection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
