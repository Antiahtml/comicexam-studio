import type { DocSettings, ExamDocument, ExamElement, ExamPage, QuestionElement } from "./types";
import { printableArea } from "./units";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EPS = 0.05;

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
}

export function intersectionArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Caja envolvente teniendo en cuenta la rotación. */
export function boundingBox(el: Box & { rotation?: number }): Box {
  const r = ((el.rotation ?? 0) * Math.PI) / 180;
  if (!r) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const w = el.w * cos + el.h * sin;
  const h = el.w * sin + el.h * cos;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export type PrintStatus = "ok" | "outsideMargins" | "outsidePage";

export function printStatus(el: ExamElement, settings: DocSettings): PrintStatus {
  const area = printableArea(settings);
  const b = boundingBox(el);
  if (b.x < -EPS || b.y < -EPS || b.x + b.w > area.pageW + EPS || b.y + b.h > area.pageH + EPS) return "outsidePage";
  if (b.x < area.x - EPS || b.y < area.y - EPS || b.x + b.w > area.x + area.w + EPS || b.y + b.h > area.y + area.h + EPS) {
    return "outsideMargins";
  }
  return "ok";
}

/** Las formas decorativas (rectángulos, elipses) se usan como fondos: no generan aviso de solape. */
function participatesInOverlap(el: ExamElement): boolean {
  if (el.type === "shape") return el.shape === "hline" || el.shape === "vline" || el.shape === "divider";
  return true;
}

/** Devuelve, para cada elemento, los ids de los elementos con los que se superpone. */
export function findOverlaps(page: ExamPage): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const els = page.elements.filter(participatesInOverlap);
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i];
      const b = els[j];
      if (intersectionArea(boundingBox(a), boundingBox(b)) > 1) {
        result.set(a.id, [...(result.get(a.id) ?? []), b.id]);
        result.set(b.id, [...(result.get(b.id) ?? []), a.id]);
      }
    }
  }
  return result;
}

export interface PageWarnings {
  outside: Map<string, PrintStatus>;
  overlaps: Map<string, string[]>;
}

export function pageWarnings(page: ExamPage, settings: DocSettings): PageWarnings {
  const outside = new Map<string, PrintStatus>();
  for (const el of page.elements) {
    const s = printStatus(el, settings);
    if (s !== "ok") outside.set(el.id, s);
  }
  return { outside, overlaps: findOverlaps(page) };
}

/**
 * Numeración automática de preguntas: por orden de página y, dentro de cada página,
 * de arriba abajo y de izquierda a derecha. Las preguntas con número manual lo conservan.
 */
export function questionNumbers(doc: ExamDocument): Map<string, string> {
  const map = new Map<string, string>();
  let n = 0;
  for (const page of doc.pages) {
    const qs = page.elements
      .filter((e): e is QuestionElement => e.type === "question")
      .sort((a, b) => (Math.abs(a.y - b.y) < 3 ? a.x - b.x : a.y - b.y));
    for (const q of qs) {
      n++;
      map.set(q.id, q.number?.trim() ? q.number.trim() : String(n));
    }
  }
  return map;
}

/** Suma de puntos de todas las preguntas. */
export function totalPoints(doc: ExamDocument): number {
  let total = 0;
  for (const p of doc.pages) for (const e of p.elements) if (e.type === "question" && e.points) total += e.points;
  return Math.round(total * 100) / 100;
}

/* ------------------------------ Alineación ------------------------------ */

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Alinea elementos respecto a la zona imprimible (uno) o a la selección (varios). */
export function alignBoxes<T extends Box>(boxes: T[], kind: AlignKind, settings: DocSettings): T[] {
  if (boxes.length === 0) return boxes;
  const area = printableArea(settings);
  const ref: Box =
    boxes.length === 1
      ? { x: area.x, y: area.y, w: area.w, h: area.h }
      : (() => {
          const x1 = Math.min(...boxes.map((b) => b.x));
          const y1 = Math.min(...boxes.map((b) => b.y));
          const x2 = Math.max(...boxes.map((b) => b.x + b.w));
          const y2 = Math.max(...boxes.map((b) => b.y + b.h));
          return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        })();
  return boxes.map((b) => {
    const c = { ...b };
    if (kind === "left") c.x = ref.x;
    if (kind === "hcenter") c.x = ref.x + (ref.w - b.w) / 2;
    if (kind === "right") c.x = ref.x + ref.w - b.w;
    if (kind === "top") c.y = ref.y;
    if (kind === "vcenter") c.y = ref.y + (ref.h - b.h) / 2;
    if (kind === "bottom") c.y = ref.y + ref.h - b.h;
    return c;
  });
}

/** Distribuye horizontal o verticalmente con el mismo espacio entre elementos. */
export function distributeBoxes<T extends Box>(boxes: T[], axis: "h" | "v"): T[] {
  if (boxes.length < 3) return boxes;
  const key = axis === "h" ? "x" : "y";
  const size = axis === "h" ? "w" : "h";
  const sorted = [...boxes].sort((a, b) => a[key] - b[key]);
  const start = sorted[0][key];
  const end = Math.max(...sorted.map((b) => b[key] + b[size]));
  const totalSize = sorted.reduce((s, b) => s + b[size], 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  const pos = new Map<T, number>();
  for (const b of sorted) {
    pos.set(b, cursor);
    cursor += b[size] + gap;
  }
  return boxes.map((b) => ({ ...b, [key]: pos.get(b)! }));
}

/* ------------------------------ Ajuste (snap) ------------------------------ */

export interface SnapResult {
  dx: number;
  dy: number;
  guidesX: number[];
  guidesY: number[];
}

/**
 * Calcula el ajuste magnético de una caja en movimiento a los márgenes, al centro de la página
 * y a los bordes/centros de otros elementos. `threshold` en mm.
 */
export function snapBox(moving: Box, others: Box[], settings: DocSettings, threshold: number): SnapResult {
  const area = printableArea(settings);
  const targetsX = [area.x, area.x + area.w, area.pageW / 2, 0, area.pageW];
  const targetsY = [area.y, area.y + area.h, area.pageH / 2, 0, area.pageH];
  for (const o of others) {
    targetsX.push(o.x, o.x + o.w, o.x + o.w / 2);
    targetsY.push(o.y, o.y + o.h, o.y + o.h / 2);
  }
  const edgesX = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const edgesY = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  let best = { d: threshold + 1, delta: 0, guide: NaN };
  for (const e of edgesX)
    for (const t of targetsX) {
      const d = Math.abs(t - e);
      if (d < best.d) best = { d, delta: t - e, guide: t };
    }
  let bestY = { d: threshold + 1, delta: 0, guide: NaN };
  for (const e of edgesY)
    for (const t of targetsY) {
      const d = Math.abs(t - e);
      if (d < bestY.d) bestY = { d, delta: t - e, guide: t };
    }
  const dx = best.d <= threshold ? best.delta : 0;
  const dy = bestY.d <= threshold ? bestY.delta : 0;
  return {
    dx,
    dy,
    guidesX: best.d <= threshold ? [best.guide] : [],
    guidesY: bestY.d <= threshold ? [bestY.guide] : [],
  };
}
