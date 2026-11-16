"use client";

import { naturalCompare } from "../archive/natural-sort";
import { withBase } from "../env";
import { createComicRecord, notifyChange, requestPersistentStorage } from "./repo";
import { getDB, nowIso } from "./db";
import { titleFromFileName } from "./titles";
import type { WorkerMessage, WorkerRequest } from "./import.worker";

/**
 * Cola de importaciones en el hilo principal. El trabajo pesado lo hace un worker (un archivo
 * cada vez, para no saturar memoria ni CPU). La interfaz recibe el progreso en tiempo real.
 */

type Listener = (m: WorkerMessage) => void;

let worker: Worker | null = null;
const listeners = new Set<Listener>();
let chain: Promise<unknown> = Promise.resolve();
const active = new Set<string>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (e.data.type !== "progress") notifyChange("comics");
      for (const l of listeners) l(e.data);
    };
  }
  return worker;
}

export function onImportMessage(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isImportActive(comicId: string) {
  return active.has(comicId);
}

function run(req: WorkerRequest): Promise<WorkerMessage & { type: "done" | "error" }> {
  const job = chain.then(
    () =>
      new Promise<WorkerMessage & { type: "done" | "error" }>((resolve) => {
        active.add(req.comicId);
        const off = onImportMessage((m) => {
          if (m.comicId !== req.comicId || m.type === "progress") return;
          off();
          active.delete(req.comicId);
          resolve(m);
        });
        getWorker().postMessage(req);
      }),
  );
  chain = job.catch(() => undefined);
  return job;
}

/** Importa un CBR/CBZ. Devuelve el id del cómic en cuanto se registra; el proceso sigue en segundo plano. */
export async function importArchiveFile(file: File): Promise<{ comicId: string; done: Promise<WorkerMessage & { type: "done" | "error" }> }> {
  void requestPersistentStorage();
  const comic = await createComicRecord({ title: titleFromFileName(file.name), originalName: file.name, format: "rar", sizeBytes: file.size });
  const done = run({ type: "archive", comicId: comic.id, file, wasmUrl: withBase("/unrar.wasm") });
  return { comicId: comic.id, done };
}

/** Importa imágenes sueltas como una colección (ordenadas por nombre). */
export async function importImageFiles(files: File[], title?: string): Promise<{ comicId: string; done: Promise<WorkerMessage & { type: "done" | "error" }> }> {
  void requestPersistentStorage();
  const sorted = [...files].sort((a, b) => naturalCompare(a.name, b.name));
  const comic = await createComicRecord({
    title: title || (sorted.length === 1 ? titleFromFileName(sorted[0].name) : `Imatges (${sorted.length})`),
    originalName: sorted.length === 1 ? sorted[0].name : `${sorted.length} imatges`,
    format: "images",
    sizeBytes: sorted.reduce((s, f) => s + f.size, 0),
  });
  const done = run({ type: "images", comicId: comic.id, files: sorted.map((f) => ({ name: f.name, data: f })) });
  return { comicId: comic.id, done };
}

/** Importa imágenes en el orden dado (proyectos .comicexam). Devuelve los ids de página en ese orden. */
export async function importOrderedImages(title: string, files: { name: string; data: Blob }[]): Promise<{ comicId: string; pageIds: string[] }> {
  const comic = await createComicRecord({ title, originalName: "projecte.comicexam", format: "bundle", sizeBytes: files.reduce((s, f) => s + f.data.size, 0) });
  const res = await run({ type: "images", comicId: comic.id, files });
  if (res.type === "error") throw new Error(res.message);
  return { comicId: comic.id, pageIds: res.pageIds };
}

/** Marca como fallidas las importaciones que quedaron a medias (p. ej. si se cerró la pestaña). */
export async function recoverStaleImports(): Promise<void> {
  const db = await getDB();
  const comics = await db.getAll("comics");
  for (const c of comics) {
    if (c.status !== "processing" || active.has(c.id)) continue;
    if (Date.now() - new Date(c.updatedAt).getTime() < 30_000) continue; // quizá la está importando otra pestaña
    await db.put("comics", { ...c, status: "error", error: "La importació s'ha interromput (s'ha tancat la pestanya?). Torna a importar el fitxer.", stage: "Error", updatedAt: nowIso() });
    notifyChange("comics");
  }
}
