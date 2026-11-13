import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { duplicateProject } from "@/lib/projects/repository";

export const runtime = "nodejs";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const copy = await duplicateProject(id);
  return NextResponse.json({ id: copy.id, name: copy.name }, { status: 201 });
});
