/// <reference lib="webworker" />
/**
 * Worker de importación: abre CBR/CBZ o imágenes sueltas, valida y procesa cada página y la
 * guarda en IndexedDB. Se ejecuta fuera del hilo principal para no bloquear la interfaz.
 */
import { detectArchive } from "../archive/detect";
import { ArchiveError, extractArchiveImages, type PlannedEntry } from "../archive/extract";
import { displayName } from "../archive/safe-path";
import { LIMITS } from "../env";
import { blobKey, getDB, nowIso, type PageRecord } from "./db";
import { ImageError, processImage } from "./images";
import { newId, deleteComicContent } from "./repo";

export type WorkerRequest =
  | { type: "archive"; comicId: string; file: File; wasmUrl: string }
  | { type: "images"; comicId: string; files: { name: string; data: Blob }[] };

export type WorkerMessage =
  | { type: "progress"; comicId: string; progress: number; stage: string }
  | { type: "done"; comicId: string; pageIds: string[] }
  | { type: "error"; comicId: string; message: string };

const post = (m: WorkerMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

async function updateComic(comicId: string, patch: Record<string, unknown>) {
  const db = await getDB();
  const c = await db.get("comics", comicId);
  if (c) await db.put("comics", { ...c, ...patch, updatedAt: nowIso() });
}

async function storePage(comicId: string, index: number, entryName: string, data: Uint8Array): Promise<string> {
  const img = await processImage(data);
  const id = newId();
  const page: PageRecord = { id, comicId, index, entryName, width: img.width, height: img.height, mime: img.mime, bytes: img.original.size };
  const db = await getDB();
  const tx = db.transaction(["pages", "blobs"], "readwrite");
  void tx.objectStore("pages").put(page);
  void tx.objectStore("blobs").put(img.original, blobKey(id, "original"));
  void tx.objectStore("blobs").put(img.thumb, blobKey(id, "thumb"));
  void tx.objectStore("blobs").put(img.preview, blobKey(id, "preview"));
  await tx.done;
  return id;
}

async function finish(comicId: string, pageIds: string[]) {
  const db = await getDB();
  const pages = (await db.getAllFromIndex("pages", "comicId", comicId)).sort((a, b) => a.index - b.index);
  await updateComic(comicId, { status: "ready", progress: 100, stage: "Listo", pageCount: pages.length, coverPageId: pages[0]?.id ?? null, error: null });
  post({ type: "done", comicId, pageIds });
}

async function fail(comicId: string, err: unknown) {
  const message =
    err instanceof ArchiveError || err instanceof ImageError ? err.message : "Se ha producido un error inesperado al importar el archivo.";
  if (!(err instanceof ArchiveError) && !(err instanceof ImageError)) console.error("[importación]", err);
  await deleteComicContent(comicId).catch(() => undefined);
  await updateComic(comicId, { status: "error", error: message, stage: "Error", progress: 0, pageCount: 0, coverPageId: null }).catch(() => undefined);
  post({ type: "error", comicId, message });
}

async function importArchive(comicId: string, file: File, wasmUrl: string) {
  if (file.size > LIMITS.maxUploadBytes) throw new ArchiveError("El archivo supera el tamaño máximo permitido (1 GB).");
  const progress = async (p: number, stage: string) => {
    post({ type: "progress", comicId, progress: p, stage });
    await updateComic(comicId, { progress: p, stage });
  };
  await progress(2, "Leyendo el archivo…");
  const data = await file.arrayBuffer();
  const kind = detectArchive(new Uint8Array(data, 0, Math.min(16, data.byteLength)));
  if (!kind) throw new ArchiveError("El archivo no es un CBR/CBZ válido (no se reconoce como RAR ni ZIP).");
  await updateComic(comicId, { format: kind });
  const wasm = kind === "rar" ? await (await fetch(wasmUrl)).arrayBuffer() : undefined;
  let plan: PlannedEntry[] = [];
  let done = 0;
  let last = 0;
  await extractArchiveImages(
    data,
    kind,
    { maxEntries: LIMITS.maxEntries, maxEntryBytes: LIMITS.maxEntryBytes, maxTotalBytes: LIMITS.maxTotalBytes, maxCompressionRatio: LIMITS.maxCompressionRatio },
    {
      onPlan: async (p) => {
        plan = p;
        await progress(5, `Extrayendo ${p.length} páginas…`);
      },
      onEntry: async (entry, bytes) => {
        try {
          await storePage(comicId, entry.index, entry.name, bytes);
        } catch (err) {
          const msg = err instanceof ImageError ? err.message : "error al procesar la imagen";
          throw new ArchiveError(`Página "${displayName(entry.name)}": ${msg}`);
        }
        done++;
        const now = Date.now();
        if (now - last > 200 || done === plan.length) {
          last = now;
          await progress(Math.min(99, 5 + Math.round((done / Math.max(1, plan.length)) * 94)), `Procesando página ${done} de ${plan.length}…`);
        }
      },
    },
    wasm,
  );
  await finish(comicId, []);
}

async function importImages(comicId: string, files: { name: string; data: Blob }[]) {
  // Se respeta el orden recibido (en los proyectos importados importa); las sueltas llegan ya ordenadas.
  const ids: string[] = [];
  for (let i = 0; i < files.length; i++) {
    if (files[i].data.size > LIMITS.maxImageUploadBytes) throw new ImageError(`La imagen "${files[i].name}" es demasiado grande.`);
    const bytes = new Uint8Array(await files[i].data.arrayBuffer());
    ids.push(await storePage(comicId, i, displayName(files[i].name), bytes));
    post({ type: "progress", comicId, progress: Math.round(((i + 1) / files.length) * 99), stage: `Procesando imagen ${i + 1} de ${files.length}…` });
  }
  await finish(comicId, ids);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === "archive") await importArchive(req.comicId, req.file, req.wasmUrl);
    else await importImages(req.comicId, req.files);
  } catch (err) {
    await fail(req.comicId, err);
  }
};
