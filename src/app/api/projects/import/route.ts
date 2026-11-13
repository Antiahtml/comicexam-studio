import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { config } from "@/lib/config";
import { importProjectBundle } from "@/lib/projects/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Importa un proyecto .comicexam (cuerpo binario). */
export const POST = handle(async (req: Request) => {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > config.limits.maxUploadBytes) return jsonError("El proyecto es demasiado grande.", 413);
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength > config.limits.maxUploadBytes) return jsonError("El proyecto es demasiado grande.", 413);
  try {
    const id = await importProjectBundle(buf);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "No se ha podido importar el proyecto.", 422);
  }
});
