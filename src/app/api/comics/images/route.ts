import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { config } from "@/lib/config";
import { importImageCollection, titleFromFileName, type IncomingImage } from "@/lib/comics/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Importa imágenes sueltas (JPG, PNG, WebP) como una colección. Cuerpo multipart con campo "files". */
export const POST = handle(async (req: Request) => {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > config.limits.maxUploadBytes) return jsonError("Las imágenes superan el tamaño máximo permitido.", 413);
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
  if (files.length === 0) return jsonError("No se ha recibido ninguna imagen.");
  if (files.length > 500) return jsonError("Demasiadas imágenes en una sola importación (máximo 500).");
  const images: IncomingImage[] = [];
  for (const f of files) {
    if (f.size > config.limits.maxImageUploadBytes) return jsonError(`La imagen "${f.name}" es demasiado grande.`, 413);
    images.push({ name: f.name || "imagen", data: Buffer.from(await f.arrayBuffer()) });
  }
  const titleField = String(form.get("title") || "").trim();
  const title = titleField || (images.length === 1 ? titleFromFileName(images[0].name) : `Imágenes (${images.length})`);
  const id = await importImageCollection(title.slice(0, 160), images);
  return NextResponse.json({ id }, { status: 201 });
});
