"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { ComicDetail } from "@/lib/client-types";

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

function uploadWithProgress(url: string, body: Blob | FormData, headers: Record<string, string>, onProgress: (p: number) => void): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      let json: { id?: string; error?: string } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* sin cuerpo */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.id) resolve({ id: json.id });
      else reject(new Error(json.error || `Error ${xhr.status} al subir el archivo`));
    };
    xhr.onerror = () => reject(new Error("No se ha podido conectar con el servidor."));
    xhr.send(body);
  });
}

/**
 * Importación de cómics (CBR/CBZ) e imágenes con barra de progreso:
 * subida en streaming + seguimiento del procesamiento en el servidor.
 */
export function useComicImport(onComplete?: (comicId: string) => void) {
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const counter = useRef(0);

  const update = (key: string, patch: Partial<ImportTask>) => setTasks((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const poll = useCallback(
    async (key: string, comicId: string) => {
      for (;;) {
        await new Promise((r) => setTimeout(r, 600));
        let c: ComicDetail;
        try {
          const res = await fetch(`/api/comics/${comicId}`, { cache: "no-store" });
          if (!res.ok) throw new Error();
          c = await res.json();
        } catch {
          continue;
        }
        if (c.status === "ready") {
          update(key, { phase: "done", progress: 100, message: `${c.pageCount} páginas importadas` });
          toast.success(`«${c.title}» importado`, { description: `${c.pageCount} páginas listas.` });
          onComplete?.(comicId);
          return;
        }
        if (c.status === "error") {
          update(key, { phase: "error", message: c.error || "Error al procesar el archivo" });
          toast.error("No se ha podido importar el archivo", { description: c.error ?? undefined });
          onComplete?.(comicId);
          return;
        }
        update(key, { progress: c.progress, message: c.stage });
      }
    },
    [onComplete],
  );

  const importFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const archives = files.filter((f) => ARCHIVE_RE.test(f.name));
      const images = files.filter((f) => IMAGE_RE.test(f.name) || /^image\/(jpeg|png|webp)$/.test(f.type));
      const rejected = files.filter((f) => !archives.includes(f) && !images.includes(f));
      if (rejected.length) {
        toast.error("Formato no compatible", { description: `${rejected.map((f) => f.name).join(", ")}. Usa CBR, CBZ, JPG, PNG o WebP.` });
      }
      for (const file of archives) {
        const key = `t${++counter.current}`;
        setTasks((ts) => [{ key, name: file.name, phase: "uploading", progress: 0, message: "Subiendo…" }, ...ts]);
        try {
          const { id } = await uploadWithProgress(
            "/api/comics",
            file,
            { "X-File-Name": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" },
            (p) => update(key, { progress: p, message: `Subiendo… ${Math.round(p)} %` }),
          );
          update(key, { phase: "processing", progress: 1, message: "Procesando…", comicId: id });
          onComplete?.(id);
          void poll(key, id);
        } catch (err) {
          update(key, { phase: "error", message: (err as Error).message });
          toast.error(`No se ha podido importar ${file.name}`, { description: (err as Error).message });
        }
      }
      if (images.length) {
        const key = `t${++counter.current}`;
        const name = images.length === 1 ? images[0].name : `${images.length} imágenes`;
        setTasks((ts) => [{ key, name, phase: "uploading", progress: 0, message: "Subiendo…" }, ...ts]);
        const form = new FormData();
        for (const img of images) form.append("files", img, img.name);
        try {
          const { id } = await uploadWithProgress("/api/comics/images", form, {}, (p) => update(key, { progress: p * 0.9, message: "Subiendo…" }));
          update(key, { phase: "done", progress: 100, message: "Imágenes importadas", comicId: id });
          toast.success("Imágenes importadas");
          onComplete?.(id);
        } catch (err) {
          update(key, { phase: "error", message: (err as Error).message });
          toast.error("No se han podido importar las imágenes", { description: (err as Error).message });
        }
      }
    },
    [onComplete, poll],
  );

  const dismiss = (key: string) => setTasks((ts) => ts.filter((t) => t.key !== key));

  return { tasks, importFiles, dismiss };
}
