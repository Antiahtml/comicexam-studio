import { NextResponse } from "next/server";
import { handle, ID_RE, jsonError } from "@/lib/api";
import { projectsUsingComic } from "@/lib/projects/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exámenes que usan imágenes de este cómic. */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("Identificador no válido", 400);
  return NextResponse.json({ usedBy: await projectsUsingComic(id) });
});
