import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { createProject, listProjects } from "@/lib/projects/repository";
import { createDefaultDocument } from "@/lib/document/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => NextResponse.json(await listProjects()));

export const POST = handle(async (req: Request) => {
  const body = z.object({ name: z.string().max(200).optional() }).parse(await req.json().catch(() => ({})));
  const name = body.name?.trim() || "Examen sin título";
  const project = await createProject(name, createDefaultDocument(name));
  return NextResponse.json({ id: project.id, name: project.name }, { status: 201 });
});
