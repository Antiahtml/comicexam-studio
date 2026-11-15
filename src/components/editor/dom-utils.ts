"use client";

import { PX_PER_MM, roundMm } from "@/lib/document/units";
import { scrollBehavior } from "@/lib/utils";

/**
 * Utilidades que miden el renderizado real de las hojas en el editor.
 * Las medidas se hacen en px de maquetación (sin el zoom, que es un transform),
 * por lo que se convierten a mm de forma exacta.
 */

function contentNode(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-el-id="${CSS.escape(id)}"] [data-content] > div`);
}

/** Altura (mm) que necesita el contenido de un elemento para verse entero. */
export function measureContentHeightMm(id: string): number | null {
  const node = contentNode(id);
  if (!node) return null;
  const prev = node.style.height;
  node.style.height = "auto";
  const px = node.scrollHeight;
  node.style.height = prev;
  return roundMm(px / PX_PER_MM + 1);
}

/** Elementos cuyo contenido no cabe en su caja (se imprimiría cortado). */
export function findClippedElements(): string[] {
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>("[data-el-id]").forEach((node) => {
    const inner = node.querySelector<HTMLElement>("[data-content] > div");
    if (inner && inner.scrollHeight > inner.clientHeight + 2) out.push(node.dataset.elId!);
  });
  return out;
}

/** Elementos con alguna imagen que no se ha podido cargar. */
export function findMissingImageElements(): string[] {
  const out = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-el-id] [data-missing-image]").forEach((node) => {
    const id = node.closest<HTMLElement>("[data-el-id]")?.dataset.elId;
    if (id) out.add(id);
  });
  return [...out];
}

/** Desplaza la vista hasta los elementos indicados y los resalta un momento. */
export function revealElements(ids: string[], zoom: number): void {
  const nodes = ids.map((id) => document.querySelector<HTMLElement>(`[data-el-id="${CSS.escape(id)}"]`)).filter(Boolean) as HTMLElement[];
  if (!nodes.length) return;
  nodes[0].scrollIntoView({ behavior: scrollBehavior(), block: "center", inline: "nearest" });
  const ring = 5 / zoom;
  for (const n of nodes) {
    n.animate(
      [
        { boxShadow: `0 0 0 ${ring}px rgba(245, 158, 11, 0.85)` },
        { boxShadow: `0 0 0 ${ring}px rgba(245, 158, 11, 0.85)`, offset: 0.6 },
        { boxShadow: `0 0 0 ${ring * 2}px rgba(245, 158, 11, 0)` },
      ],
      { duration: 1400, easing: "ease-out" },
    );
  }
}
