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
      return `la imatge «${el.src.label}»`;
    case "text": {
      const first = el.text.split("\n")[0].trim();
      return first ? `el text «${first.length > 30 ? `${first.slice(0, 30)}…` : first}»` : "un text buit";
    }
    case "lines":
      return "les línies de resposta";
    case "box":
      return el.label ? `el quadre «${el.label}»` : "un quadre de resposta";
    case "table":
      return "una taula";
    case "shape":
      return el.shape === "divider" ? `el separador «${el.title}»` : "una forma";
    case "examHeader":
      return "la capçalera de l'examen";
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
  const where = (i: number) => (multiplePages ? ` (full ${i + 1})` : "");

  doc.pages.forEach((page, pageIndex) => {
    if (page.elements.length === 0 && multiplePages) {
      issues.push({
        key: `empty:${page.id}`,
        kind: "emptyPage",
        severity: "warning",
        pageIndex,
        message: `El full ${pageIndex + 1} és buit i s'imprimirà en blanc.`,
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
          message: `${capital(label)} surt del full${where(pageIndex)}: una part no s'imprimirà.`,
        });
      } else if (status === "outsideMargins") {
        issues.push({
          key: `margin:${el.id}`,
          kind: "outsideMargins",
          severity: "warning",
          pageIndex,
          elementId: el.id,
          message: `${capital(label)} envaeix els marges${where(pageIndex)}; algunes impressores ho tallen.`,
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
            message: `${capital(label)} té poca resolució per a la seva mida (${dpi} ppp): es pot veure borrosa. Redueix-ne la mida o utilitza una retallada més gran.`,
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
          message: `${capital(label)} és «sobre imatge», però no té cap vinyeta assignada.`,
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
            message: `${capital(elementLabel(els[i], numbers))} i ${elementLabel(els[j], numbers)} se superposen${where(pageIndex)}.`,
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
      message: `La nota total de la capçalera és ${fmt(doc.meta.totalScore)}, però les preguntes sumen ${fmt(sum)} punts.`,
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
    const hoja = doc.pages.length > 1 ? ` (full ${pageIndex + 1})` : "";
    return kind === "clipped"
      ? { key: `clip:${el.id}`, kind, severity: "error", pageIndex, elementId: el.id, message: `${label} no hi cap a la seva caixa${hoja}: el final s'imprimiria tallat.` }
      : { key: `missing:${el.id}`, kind, severity: "error", pageIndex, elementId: el.id, message: `${label} no està disponible${hoja}: s'ha eliminat el còmic d'origen.` };
  }
  return null;
}

export function sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => (a.severity === b.severity ? (a.pageIndex ?? -1) - (b.pageIndex ?? -1) : a.severity === "error" ? -1 : 1));
}
