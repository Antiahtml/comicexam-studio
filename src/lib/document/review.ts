import type { ExamDocument, ExamElement, ImageSource } from "./types";
import { boundingBox, intersectionArea, printStatus, questionNumbers, totalPoints } from "./geometry";

/**
 * Revisión del examen antes de exportar: detecta lo que saldría mal impreso.
 * Las comprobaciones que dependen del renderizado (texto recortado, imágenes no disponibles)
 * se hacen en el cliente y se añaden con `domIssue`.
 */

export type IssueKind =
  | "outsidePage"
  | "outsideMargins"
  | "overlap"
  | "lowDpi"
  | "totalMismatch"
  | "emptyPage"
  | "imageQuestionWithoutImage"
  | "clipped"
  | "missingImage";

export interface ReviewIssue {
  /** Identificador estable (para listas de React). */
  key: string;
  kind: IssueKind;
  /** error = falta contenido en el papel · warning = conviene revisarlo */
  severity: "error" | "warning";
  message: string;
  pageIndex?: number;
  elementId?: string;
}

/** Resolución mínima recomendada para imprimir (píxeles por pulgada). */
export const MIN_PRINT_DPI = 150;

/** Nombre corto y reconocible de un elemento para los mensajes. */
export function elementLabel(el: ExamElement, numbers: Map<string, string>): string {
  switch (el.type) {
    case "question":
      return `la pregunta ${numbers.get(el.id) ?? ""}`.trim();
    case "image":
      return `la imagen «${el.src.label}»`;
    case "text": {
      const first = el.text.split("\n")[0].trim();
      return first ? `el texto «${first.length > 30 ? `${first.slice(0, 30)}…` : first}»` : "un texto vacío";
    }
    case "lines":
      return "las líneas de respuesta";
    case "box":
      return el.label ? `el cuadro «${el.label}»` : "un cuadro de respuesta";
    case "table":
      return "una tabla";
    case "shape":
      return el.shape === "divider" ? `el separador «${el.title}»` : "una forma";
    case "examHeader":
      return "la cabecera del examen";
  }
}

/** Píxeles por pulgada efectivos de una imagen impresa a `wMm` × `hMm`. */
export function printDpi(src: ImageSource, wMm: number, hMm: number): number {
  const pxW = src.crop.w * src.pageWidth;
  const pxH = src.crop.h * src.pageHeight;
  return Math.round(Math.min(pxW / (wMm / 25.4), pxH / (hMm / 25.4)));
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number) => String(n).replace(".", ",");

export function reviewDocument(doc: ExamDocument): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const numbers = questionNumbers(doc);
  const multiplePages = doc.pages.length > 1;
  const where = (i: number) => (multiplePages ? ` (hoja ${i + 1})` : "");

  doc.pages.forEach((page, pageIndex) => {
    if (page.elements.length === 0 && multiplePages) {
      issues.push({
        key: `empty:${page.id}`,
        kind: "emptyPage",
        severity: "warning",
        pageIndex,
        message: `La hoja ${pageIndex + 1} está vacía y se imprimirá en blanco.`,
      });
    }
    for (const el of page.elements) {
      const label = elementLabel(el, numbers);
      const status = printStatus(el, doc.settings);
      if (status === "outsidePage") {
        issues.push({
          key: `out:${el.id}`,
          kind: "outsidePage",
          severity: "error",
          pageIndex,
          elementId: el.id,
          message: `${capital(label)} se sale de la hoja${where(pageIndex)}: una parte no se imprimirá.`,
        });
      } else if (status === "outsideMargins") {
        issues.push({
          key: `margin:${el.id}`,
          kind: "outsideMargins",
          severity: "warning",
          pageIndex,
          elementId: el.id,
          message: `${capital(label)} invade los márgenes${where(pageIndex)}; algunas impresoras lo cortan.`,
        });
      }
      if (el.type === "image") {
        const dpi = printDpi(el.src, el.w, el.h);
        if (dpi < MIN_PRINT_DPI) {
          issues.push({
            key: `dpi:${el.id}`,
            kind: "lowDpi",
            severity: "warning",
            pageIndex,
            elementId: el.id,
            message: `${capital(label)} tiene poca resolución para su tamaño (${dpi} ppp): puede verse borrosa. Redúcela o usa un recorte más grande.`,
          });
        }
      }
      if (el.type === "question" && el.kind === "image" && !el.image) {
        issues.push({
          key: `noimg:${el.id}`,
          kind: "imageQuestionWithoutImage",
          severity: "error",
          pageIndex,
          elementId: el.id,
          message: `${capital(label)} es «sobre imagen», pero no tiene ninguna viñeta asignada.`,
        });
      }
    }
    // Solapes (una entrada por pareja; las formas de fondo no cuentan)
    const els = page.elements.filter((e) => e.type !== "shape" || e.shape === "hline" || e.shape === "vline" || e.shape === "divider");
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        if (intersectionArea(boundingBox(els[i]), boundingBox(els[j])) > 1) {
          issues.push({
            key: `overlap:${els[i].id}:${els[j].id}`,
            kind: "overlap",
            severity: "warning",
            pageIndex,
            elementId: els[j].id,
            message: `${capital(elementLabel(els[i], numbers))} y ${elementLabel(els[j], numbers)} se superponen${where(pageIndex)}.`,
          });
        }
      }
  });

  const sum = totalPoints(doc);
  if (sum > 0 && doc.meta.totalScore !== null && Math.abs(doc.meta.totalScore - sum) > 0.001) {
    issues.push({
      key: "total",
      kind: "totalMismatch",
      severity: "warning",
      message: `La nota total de la cabecera es ${fmt(doc.meta.totalScore)}, pero las preguntas suman ${fmt(sum)} puntos.`,
    });
  }
  return sortIssues(issues);
}

/** Problemas detectados midiendo el renderizado en el navegador. */
export function domIssue(doc: ExamDocument, kind: "clipped" | "missingImage", elementId: string): ReviewIssue | null {
  const numbers = questionNumbers(doc);
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
    const el = doc.pages[pageIndex].elements.find((e) => e.id === elementId);
    if (!el) continue;
    const label = capital(elementLabel(el, numbers));
    const hoja = doc.pages.length > 1 ? ` (hoja ${pageIndex + 1})` : "";
    return kind === "clipped"
      ? { key: `clip:${el.id}`, kind, severity: "error", pageIndex, elementId: el.id, message: `${label} no cabe en su caja${hoja}: el final se imprimiría cortado.` }
      : { key: `missing:${el.id}`, kind, severity: "error", pageIndex, elementId: el.id, message: `${label} no está disponible${hoja}: se eliminó el cómic de origen.` };
  }
  return null;
}

export function sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => (a.severity === b.severity ? (a.pageIndex ?? -1) - (b.pageIndex ?? -1) : a.severity === "error" ? -1 : 1));
}
