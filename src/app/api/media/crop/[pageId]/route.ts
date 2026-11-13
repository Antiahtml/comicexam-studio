import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { handle, ID_RE, jsonError } from "@/lib/api";
import { cropImage } from "@/lib/images/process";
import { isValidRect } from "@/lib/regions/coords";

export const runtime = "nodejs";

/**
 * Recorte de una página a partir de coordenadas normalizadas.
 * ?r=x,y,w,h  &max=ancho máximo en px (0 = resolución original, para el PDF)
 */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await params;
  if (!ID_RE.test(pageId)) return jsonError("Identificador no válido", 400);
  const sp = new URL(req.url).searchParams;
  const parts = (sp.get("r") ?? "").split(",").map(Number);
  const rect = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  if (parts.length !== 4 || !isValidRect(rect)) return jsonError("Región de recorte no válida", 400);
  const maxRaw = Number(sp.get("max") ?? 1400);
  const max = Number.isFinite(maxRaw) ? Math.max(0, Math.min(6000, Math.round(maxRaw))) : 1400;
  const page = await prisma.comicPage.findUnique({ where: { id: pageId } });
  if (!page) return jsonError("Página no encontrada", 404);
  const out = await cropImage(page.path, page.mime, page.width, page.height, rect, max);
  const data = await fs.readFile(out.file);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": out.mime,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
