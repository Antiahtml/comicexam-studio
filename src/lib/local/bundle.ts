import { strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { parseDocument } from "../document/schema";
import type { ExamDocument, ImageSource } from "../document/types";
import { LIMITS } from "../env";
import { blobKey, getDB } from "./db";
import { createProject, getProject, referencedPageIds } from "./repo";

/**
 * Formato de intercambio ".comicexam": un ZIP con
 *   - comicexam.json  → manifiesto (nombre, documento y lista de páginas usadas)
 *   - pages/<n>.<ext> → imágenes originales de esas páginas
 * Es el mismo formato que la versión anterior con servidor, así que sus copias se pueden importar.
 */

const manifestSchema = z.object({
  format: z.literal("comicexam"),
  version: z.literal(1),
  name: z.string().max(200),
  document: z.unknown(),
  pages: z
    .array(
      z.object({
        id: z.string().max(64),
        comicId: z.string().max(64),
        comicTitle: z.string().max(300),
        index: z.number().int().min(0),
        file: z.string().regex(/^pages\/\d{1,5}\.(jpg|png|webp)$/),
      }),
    )
    .max(2000),
});

export type BundleManifest = z.infer<typeof manifestSchema>;

export async function exportProjectBundle(projectId: string): Promise<{ name: string; data: Uint8Array }> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Examen no encontrado");
  const db = await getDB();
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const pages: BundleManifest["pages"] = [];
  let n = 0;
  for (const pageId of referencedPageIds(project.document)) {
    const [page, blob] = await Promise.all([db.get("pages", pageId), db.get("blobs", blobKey(pageId, "original"))]);
    if (!page || !blob) continue; // imagen no disponible: se exporta el resto
    const comic = await db.get("comics", page.comicId);
    const ext = page.mime === "image/png" ? "png" : page.mime === "image/webp" ? "webp" : "jpg";
    const file = `pages/${n++}.${ext}`;
    files[file] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    pages.push({ id: page.id, comicId: page.comicId, comicTitle: comic?.title ?? "Cómic", index: page.index, file });
  }
  const manifest: BundleManifest = { format: "comicexam", version: 1, name: project.name, document: project.document, pages };
  files["comicexam.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return { name: project.name, data: zipSync(files) };
}

/** Lee y valida un .comicexam (sin escribir nada todavía). */
export function readBundle(bytes: Uint8Array): { manifest: BundleManifest; document: ExamDocument; files: Map<string, Uint8Array> } {
  if (bytes.byteLength > LIMITS.maxUploadBytes) throw new Error("El proyecto es demasiado grande.");
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        if (f.originalSize > LIMITS.maxEntryBytes) throw new Error("Un recurso del proyecto es demasiado grande.");
        total += f.originalSize;
        if (total > LIMITS.maxTotalBytes) throw new Error("El proyecto es demasiado grande.");
        return f.name === "comicexam.json" || /^pages\/\d{1,5}\.(jpg|png|webp)$/.test(f.name);
      },
    });
  } catch (err) {
    throw new Error(err instanceof Error && /demasiado grande/.test(err.message) ? err.message : "El archivo no es un proyecto .comicexam válido.");
  }
  const raw = entries["comicexam.json"];
  if (!raw) throw new Error("Falta el archivo comicexam.json en el proyecto.");
  let manifest: BundleManifest;
  try {
    manifest = manifestSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    throw new Error("El manifiesto del proyecto no es válido.");
  }
  let document: ExamDocument;
  try {
    document = parseDocument(manifest.document);
  } catch {
    throw new Error("El examen incluido en el proyecto no es válido.");
  }
  for (const p of manifest.pages) if (!entries[p.file]) throw new Error(`Falta la imagen ${p.file} en el proyecto.`);
  return { manifest, document, files: new Map(Object.entries(entries)) };
}

/** Sustituye las referencias a páginas antiguas por las nuevas tras importar las imágenes. */
export function remapDocument(doc: ExamDocument, map: Map<string, { pageId: string; comicId: string; width: number; height: number }>): ExamDocument {
  const out = structuredClone(doc);
  const remap = (src: ImageSource): ImageSource => {
    const m = map.get(src.pageId);
    return m ? { ...src, pageId: m.pageId, comicId: m.comicId, selectionId: null, pageWidth: m.width, pageHeight: m.height } : src;
  };
  for (const page of out.pages)
    for (const el of page.elements) {
      if (el.type === "image") el.src = remap(el.src);
      if (el.type === "question" && el.image) el.image = remap(el.image);
    }
  return out;
}

/**
 * Importa un .comicexam: crea una colección con sus imágenes (procesadas por el worker) y un examen
 * nuevo con las referencias actualizadas. `importImages` se inyecta para poder probar sin navegador.
 */
export async function importProjectBundle(
  bytes: Uint8Array,
  importImages: (title: string, files: { name: string; data: Blob }[]) => Promise<{ comicId: string; pageIds: string[] }>,
): Promise<string> {
  const { manifest, document, files } = readBundle(bytes);
  const map = new Map<string, { pageId: string; comicId: string; width: number; height: number }>();
  if (manifest.pages.length > 0) {
    const mime = (f: string) => (f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg");
    const res = await importImages(
      `Recursos de «${manifest.name}»`,
      manifest.pages.map((p) => ({ name: `${p.comicTitle} · pág. ${p.index + 1}`, data: new Blob([files.get(p.file)! as BlobPart], { type: mime(p.file) }) })),
    );
    const db = await getDB();
    for (let i = 0; i < manifest.pages.length; i++) {
      const page = await db.get("pages", res.pageIds[i]);
      if (page) map.set(manifest.pages[i].id, { pageId: page.id, comicId: res.comicId, width: page.width, height: page.height });
    }
  }
  const project = await createProject(manifest.name, remapDocument(document, map));
  return project.id;
}
