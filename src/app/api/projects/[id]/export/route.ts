import { handle } from "@/lib/api";
import { exportProjectBundle } from "@/lib/projects/bundle";
import { contentDisposition } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga el proyecto como archivo .comicexam (ZIP con JSON + imágenes originales). */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const bundle = await exportProjectBundle(id);
  const name = `${bundle.name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").trim() || "proyecto"}.comicexam`;
  return new Response(new Uint8Array(bundle.data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(bundle.data.byteLength),
      "Content-Disposition": contentDisposition(name, false),
    },
  });
});
