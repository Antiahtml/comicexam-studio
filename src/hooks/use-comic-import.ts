"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { importArchiveFile, importImageFiles, onImportMessage } from "@/lib/local/import-service";
import { getComic } from "@/lib/local/repo";
import { LIMITS } from "@/lib/env";

export interface ImportTask {
  key: string;
  name: string;
  phase: "uploading" | "processing" | "done" | "error";
  /** 0..100 */
  progress: number;
  message: string;
  comicId?: string;
}

const ARCHIVE_RE = /\.(cbr|cbz|rar|zip)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

/**
 * Importación de cómics (CBR/CBZ) e imágenes con barra de progreso. El archivo no sale del
 * navegador: lo procesa un worker y se guarda en la base de datos local.
 */
export function useComicImport(onComplete?: (comicId: string) => void) {
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const counter = useRef(0);
  const keyByComic = useRef(new Map<string, string>());
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const update = (key: string, patch: Partial<ImportTask>) => setTasks((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  // Progreso en tiempo real desde el worker.
  useEffect(
    () =>
      onImportMessage((m) => {
        const key = keyByComic.current.get(m.comicId);
        if (!key) return;
        if (m.type === "progress") update(key, { phase: "processing", progress: m.progress, message: m.stage });
      }),
    [],
  );

  const track = useCallback(async (key: string, comicId: string, done: Promise<{ type: "done" | "error"; message?: string }>) => {
    keyByComic.current.set(comicId, key);
    update(key, { phase: "processing", progress: 1, message: "Processant…", comicId });
    onCompleteRef.current?.(comicId);
    const res = await done;
    keyByComic.current.delete(comicId);
    const comic = await getComic(comicId);
    if (res.type === "done" && comic) {
      update(key, { phase: "done", progress: 100, message: `${comic.pageCount} pàgina${comic.pageCount === 1 ? "" : "es"} importada${comic.pageCount === 1 ? "" : "es"}` });
      toast.success(`«${comic.title}» importat`, { description: `${comic.pageCount} pàgines a punt.` });
    } else {
      const msg = ("message" in res && res.message) || comic?.error || "Error en processar el fitxer";
      update(key, { phase: "error", message: msg });
      toast.error("No s'ha pogut importar el fitxer", { description: msg });
    }
    onCompleteRef.current?.(comicId);
  }, []);

  const importFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const archives = files.filter((f) => ARCHIVE_RE.test(f.name));
      const images = files.filter((f) => !archives.includes(f) && (IMAGE_RE.test(f.name) || /^image\/(jpeg|png|webp)$/.test(f.type)));
      const rejected = files.filter((f) => !archives.includes(f) && !images.includes(f));
      if (rejected.length) {
        toast.error("Format no compatible", { description: `${rejected.map((f) => f.name).join(", ")}. Utilitza CBR, CBZ, JPG, PNG o WebP.` });
      }
      for (const file of archives) {
        const key = `t${++counter.current}`;
        setTasks((ts) => [{ key, name: file.name, phase: "uploading", progress: 0, message: "En cua…" }, ...ts]);
        if (file.size > LIMITS.maxUploadBytes) {
          update(key, { phase: "error", message: "El fitxer supera la mida màxima permesa (1 GB)." });
          continue;
        }
        try {
          const { comicId, done } = await importArchiveFile(file);
          void track(key, comicId, done);
        } catch (err) {
          update(key, { phase: "error", message: (err as Error).message });
        }
      }
      if (images.length) {
        const key = `t${++counter.current}`;
        const name = images.length === 1 ? images[0].name : `${images.length} imatges`;
        setTasks((ts) => [{ key, name, phase: "uploading", progress: 0, message: "En cua…" }, ...ts]);
        try {
          const { comicId, done } = await importImageFiles(images);
          void track(key, comicId, done);
        } catch (err) {
          update(key, { phase: "error", message: (err as Error).message });
        }
      }
    },
    [track],
  );

  const dismiss = (key: string) => setTasks((ts) => ts.filter((t) => t.key !== key));

  return { tasks, importFiles, dismiss };
}
