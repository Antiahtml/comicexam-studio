import { handle, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { contentDisposition, PdfError, renderPdfFromUrl, safePdfFileName } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Genera el PDF del proyecto con Chromium.
 * ?filename=…  nombre del archivo   ·   ?inline=1  mostrar en el navegador (vista previa)
 */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!project) return jsonError("Proyecto no encontrado", 404);
  const url = new URL(req.url);
  const fileName = safePdfFileName(url.searchParams.get("filename") || project.name);
  const inline = url.searchParams.get("inline") === "1";
  // Chromium accede a la vista de impresión del propio servidor local.
  const printUrl = new URL(`/print/${encodeURIComponent(id)}`, internalOrigin(req));
  try {
    const pdf = await renderPdfFromUrl({ url: printUrl.toString() });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": contentDisposition(fileName, inline),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof PdfError) return jsonError(err.message, 500);
    throw err;
  }
});

/** Origen local para que Chromium cargue la vista de impresión (evita depender de proxies externos). */
function internalOrigin(req: Request): string {
  if (process.env.INTERNAL_BASE_URL) return process.env.INTERNAL_BASE_URL;
  const u = new URL(req.url);
  const port = process.env.PORT || u.port || "3000";
  return `http://127.0.0.1:${port}`;
}
