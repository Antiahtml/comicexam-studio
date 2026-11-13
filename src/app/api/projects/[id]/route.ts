import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonError } from "@/lib/api";
import { deleteProject, getProject, renameProject, saveProject } from "@/lib/projects/repository";
import { safeParseDocument } from "@/lib/document/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return jsonError("Proyecto no encontrado", 404);
  return NextResponse.json(project);
});

/** Guardado completo (autoguardado del editor). */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = (await req.json()) as { name?: unknown; document?: unknown };
  const parsed = safeParseDocument(body.document);
  if (!parsed.ok) return jsonError(parsed.error, 422);
  const name = typeof body.name === "string" ? body.name : undefined;
  const result = await saveProject(id, { name, document: parsed.doc });
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt });
});

/** Cambiar el nombre. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = z.object({ name: z.string().trim().min(1).max(200) }).parse(await req.json());
  const result = await renameProject(id, body.name);
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
});
