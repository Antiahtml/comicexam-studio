"use client";

import { withBase } from "./env";
import { safeFileName } from "./utils";

/**
 * Exportación a PDF con el propio navegador: se carga la vista de impresión (las mismas medidas en
 * mm que el editor) y se abre el diálogo de imprimir, donde se elige «Guardar como PDF». El resultado
 * es un PDF vectorial (texto nítido) con las viñetas a la resolución original.
 */

type PrintWindow = Window & { __PRINT_READY__?: boolean; __PRINT_ERRORS__?: number };

export function printViewUrl(projectId: string): string {
  return withBase(`/imprimir/?id=${encodeURIComponent(projectId)}`);
}

/** Espera a que la vista de impresión haya cargado fuentes e imágenes. */
export async function waitForPrintReady(frame: HTMLIFrameElement, timeoutMs = 90_000): Promise<{ errors: number }> {
  const start = Date.now();
  for (;;) {
    const w = frame.contentWindow as PrintWindow | null;
    if (w?.__PRINT_READY__) return { errors: w.__PRINT_ERRORS__ ?? 0 };
    if (Date.now() - start > timeoutMs) throw new Error("La vista d'impressió triga massa a carregar. Torna-ho a provar.");
    await new Promise((r) => setTimeout(r, 120));
  }
}

/** Abre el diálogo de impresión de un iframe con la vista de impresión ya cargada. */
export function printFrame(frame: HTMLIFrameElement, fileName: string): Promise<void> {
  const w = frame.contentWindow;
  if (!w) return Promise.reject(new Error("No s'ha pogut preparar la impressió."));
  // El nombre que propone «Guardar como PDF» sale del título del documento.
  const title = safeFileName(fileName.replace(/\.pdf$/i, ""));
  const previous = document.title;
  document.title = title;
  if (w.document) w.document.title = title;
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      document.title = previous;
      resolve();
    };
    w.addEventListener("afterprint", done, { once: true });
    w.focus();
    w.print();
    // Chrome bloquea hasta cerrar el diálogo; en otros navegadores se espera a «afterprint».
    setTimeout(done, 2000);
  });
}

/** Imprime un examen sin salir de la página (iframe oculto). */
export async function printProject(projectId: string, fileName: string): Promise<{ errors: number }> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "1200px", height: "1000px", border: "0", visibility: "hidden" });
  frame.src = printViewUrl(projectId);
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      frame.addEventListener("load", () => resolve(), { once: true });
      frame.addEventListener("error", () => reject(new Error("No s'ha pogut carregar la vista d'impressió.")), { once: true });
    });
    const res = await waitForPrintReady(frame);
    await printFrame(frame, fileName);
    return res;
  } finally {
    // Se retira un poco después para no interrumpir la impresión en navegadores asíncronos.
    setTimeout(() => frame.remove(), 60_000);
  }
}
