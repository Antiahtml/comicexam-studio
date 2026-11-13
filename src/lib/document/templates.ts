import type { ExamElement, QuestionKind, ShapeKind } from "./types";
import { createBox, createExamHeader, createLines, createQuestion, createShape, createTable, createText, type TextPreset } from "./factory";

/** Plantillas de elementos que se pueden insertar desde el panel izquierdo (clic o arrastrar). */
export type ElementTemplate =
  | { kind: "text"; preset: TextPreset }
  | { kind: "question"; question: QuestionKind }
  | { kind: "lines"; count: number }
  | { kind: "box"; variant: "box" | "area" | "grid" }
  | { kind: "table"; rows: number; cols: number }
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "examHeader" };

export function createFromTemplate(t: ElementTemplate): ExamElement {
  switch (t.kind) {
    case "text":
      return createText(t.preset);
    case "question":
      return createQuestion(t.question);
    case "lines":
      return createLines(t.count);
    case "box":
      return createBox(t.variant);
    case "table":
      return createTable(t.rows, t.cols);
    case "shape":
      return createShape(t.shape);
    case "examHeader":
      return createExamHeader();
  }
}

export const DND_IMAGE = "application/x-comicexam-image";
export const DND_TEMPLATE = "application/x-comicexam-element";
