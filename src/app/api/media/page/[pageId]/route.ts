import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { dataPath } from "@/lib/storage";
import { handle, ID_RE, jsonError } from "@/lib/api";

export const runtime = "nodejs";

/** Sirve una página: miniatura (thumb), previsualización (preview) u original. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await params;
  if (!ID_RE.test(pageId)) return jsonError("Identificador no válido", 400);
  const v = new URL(req.url).searchParams.get("v") ?? "preview";
  const page = await prisma.comicPage.findUnique({ where: { id: pageId } });
  if (!page) return jsonError("Página no encontrada", 404);
  const rel = v === "thumb" ? page.thumbPath : v === "original" ? page.path : page.previewPath;
  const mime = v === "original" ? page.mime : "image/webp";
  const data = await fs.readFile(dataPath(rel));
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.byteLength),
      // Las páginas son inmutables: el id cambia si se reimporta.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
