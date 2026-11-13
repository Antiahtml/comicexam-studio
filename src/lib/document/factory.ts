import { nanoid } from "nanoid";
import type {
  BorderStyle,
  BoxElement,
  DocSettings,
  ExamDocument,
  ExamElement,
  ExamHeaderElement,
  ExamPage,
  ImageElement,
  ImageSource,
  LinesElement,
  QuestionElement,
  QuestionKind,
  ShapeElement,
  ShapeKind,
  TableElement,
  TextElement,
  TextStyle,
} from "./types";
import { printableArea, roundMm } from "./units";
import { cropAspect } from "../regions/coords";

export const newId = () => nanoid(12);

export const NO_BORDER: BorderStyle = { width: 0, color: "#1f2937", radius: 0, style: "solid" };

export function defaultSettings(): DocSettings {
  return {
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    showPageNumbers: true,
    pageNumberFormat: "pagina-n-de-total",
    pageNumberPosition: "center",
    header: { enabled: false, left: "{asignatura}", center: "", right: "{curso}" },
    footer: { enabled: false, left: "{titulo}", center: "", right: "" },
    fontFamily: "inter",
    showPoints: true,
  };
}

export function todayEs(): string {
  return new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function createDefaultDocument(title = "Examen sin título"): ExamDocument {
  const settings = defaultSettings();
  const area = printableArea(settings);
  const header = createExamHeader();
  header.x = area.x;
  header.y = area.y;
  header.w = area.w;
  return {
    version: 1,
    meta: {
      title,
      subject: "",
      course: "",
      date: todayEs(),
      totalScore: 10,
      instructions: "Lee atentamente cada pregunta y responde con letra clara.",
    },
    settings,
    pages: [{ id: newId(), elements: [header] }],
  };
}

export function createPage(): ExamPage {
  return { id: newId(), elements: [] };
}

const baseProps = (w: number, h: number) => ({ id: newId(), x: 0, y: 0, w, h, rotation: 0, locked: false });

export function defaultTextStyle(partial: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: "inherit",
    fontSize: 11,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    lineHeight: 1.35,
    color: "#111827",
    background: null,
    padding: 1,
    ...partial,
  };
}

export type TextPreset = "title" | "subtitle" | "paragraph" | "instructions" | "note";

export function createText(preset: TextPreset = "paragraph"): TextElement {
  switch (preset) {
    case "title":
      return { ...baseProps(180, 14), type: "text", text: "Título", style: defaultTextStyle({ fontSize: 22, bold: true }), border: NO_BORDER };
    case "subtitle":
      return { ...baseProps(180, 10), type: "text", text: "Subtítulo de sección", style: defaultTextStyle({ fontSize: 15, bold: true, color: "#1e3a8a" }), border: NO_BORDER };
    case "instructions":
      return {
        ...baseProps(180, 18),
        type: "text",
        text: "Instrucciones: observa las viñetas y responde a las preguntas.",
        style: defaultTextStyle({ fontSize: 10.5, italic: true, background: "#f3f4f6", padding: 3 }),
        border: { width: 0.75, color: "#9ca3af", radius: 2, style: "solid" },
      };
    case "note":
      return {
        ...baseProps(80, 14),
        type: "text",
        text: "Recuerda: …",
        style: defaultTextStyle({ fontSize: 10, background: "#fef3c7", padding: 3 }),
        border: { width: 0.75, color: "#f59e0b", radius: 2, style: "solid" },
      };
    default:
      return { ...baseProps(180, 12), type: "text", text: "Escribe aquí tu texto.", style: defaultTextStyle(), border: NO_BORDER };
  }
}

const QUESTION_DEFAULTS: Record<QuestionKind, { prompt: string; h: number; lines: number }> = {
  short: { prompt: "¿Cómo se llama el protagonista?", h: 20, lines: 1 },
  long: { prompt: "¿Qué está ocurriendo en esta escena? Explica tu respuesta.", h: 50, lines: 5 },
  multiple: { prompt: "¿Qué emoción muestra el personaje en la viñeta?", h: 30, lines: 0 },
  truefalse: { prompt: "Indica si las siguientes afirmaciones son verdaderas (V) o falsas (F).", h: 34, lines: 0 },
  match: { prompt: "Relaciona cada personaje con su descripción.", h: 40, lines: 0 },
  image: { prompt: "Observa la imagen y describe lo que ves.", h: 95, lines: 4 },
};

export const QUESTION_LABELS: Record<QuestionKind, string> = {
  short: "Respuesta corta",
  long: "Respuesta larga",
  multiple: "Opción múltiple",
  truefalse: "Verdadero o falso",
  match: "Relacionar conceptos",
  image: "Pregunta sobre imagen",
};

export function createQuestion(kind: QuestionKind): QuestionElement {
  const d = QUESTION_DEFAULTS[kind];
  return {
    ...baseProps(180, d.h),
    type: "question",
    kind,
    number: null,
    prompt: d.prompt,
    points: 1,
    lines: d.lines,
    lineSpacing: 8,
    lineStyle: "solid",
    options: kind === "multiple" ? ["Alegría", "Miedo", "Sorpresa", "Enfado"] : [],
    optionColumns: 2,
    statements: kind === "truefalse" ? ["El protagonista está en su casa.", "La escena ocurre de noche.", "Hay tres personajes en la viñeta."] : [],
    pairs:
      kind === "match"
        ? [
            { left: "Personaje A", right: "Es valiente" },
            { left: "Personaje B", right: "Es curioso" },
            { left: "Personaje C", right: "Es desconfiado" },
          ]
        : [],
    image: null,
    imageHeight: 55,
    fontFamily: "inherit",
    fontSize: 11,
    color: "#111827",
    border: NO_BORDER,
  };
}

export function createLines(count = 4): LinesElement {
  const spacing = 8;
  return { ...baseProps(180, count * spacing + 1), type: "lines", count, spacing, lineStyle: "solid", color: "#6b7280", thickness: 0.6 };
}

export function createBox(variant: "box" | "area" | "grid" = "box"): BoxElement {
  return {
    ...baseProps(180, variant === "box" ? 30 : 60),
    type: "box",
    label: variant === "area" ? "Respuesta:" : "",
    border: { width: 0.75, color: "#6b7280", radius: variant === "box" ? 2 : 0, style: "solid" },
    background: null,
    grid: variant === "grid" ? 5 : 0,
  };
}

export function createTable(rows = 3, cols = 3): TableElement {
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? `Columna ${c + 1}` : "")));
  return { ...baseProps(180, rows * 10), type: "table", rows, cols, cells, headerRow: true, fontSize: 10, borderColor: "#4b5563" };
}

export function createShape(shape: ShapeKind): ShapeElement {
  const size: Record<ShapeKind, [number, number]> = { rect: [60, 30], ellipse: [40, 40], hline: [180, 2], vline: [2, 60], divider: [180, 9] };
  const [w, h] = size[shape];
  return {
    ...baseProps(w, h),
    type: "shape",
    shape,
    stroke: shape === "divider" ? "#1e3a8a" : "#374151",
    strokeWidth: shape === "divider" ? 1.5 : 1,
    dash: "solid",
    fill: null,
    radius: shape === "rect" ? 2 : 0,
    title: shape === "divider" ? "Sección 1" : "",
  };
}

export function createExamHeader(): ExamHeaderElement {
  return {
    ...baseProps(180, 42),
    type: "examHeader",
    variant: "boxed",
    showName: true,
    showCourse: true,
    showDate: true,
    showScore: true,
    showInstructions: true,
  };
}

/** Crea un elemento de imagen respetando la relación de aspecto del recorte. */
export function createImage(src: ImageSource, maxW: number, maxH: number): ImageElement {
  const aspect = cropAspect(src.crop, src.pageWidth, src.pageHeight);
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return {
    ...baseProps(roundMm(w), roundMm(h)),
    type: "image",
    src,
    fit: "contain",
    lockAspect: true,
    border: { width: 0.75, color: "#111827", radius: 0, style: "solid" },
    caption: "",
    opacity: 1,
  };
}

/** Copia profunda con identificadores nuevos. */
export function cloneElement<T extends ExamElement>(el: T, offset = 0): T {
  const copy = structuredClone(el);
  copy.id = newId();
  copy.x = roundMm(copy.x + offset);
  copy.y = roundMm(copy.y + offset);
  return copy;
}

export function clonePage(page: ExamPage): ExamPage {
  return { id: newId(), elements: page.elements.map((e) => cloneElement(e)) };
}

/**
 * Busca una posición libre para un elemento nuevo: debajo del último elemento de la página,
 * dentro de los márgenes. Si no cabe, se coloca arriba a la izquierda (el editor avisará del solape).
 */
export function findInsertPosition(page: ExamPage, settings: DocSettings, w: number, h: number): { x: number; y: number; fits: boolean } {
  const area = printableArea(settings);
  void w;
  const bottom = page.elements.reduce((max, e) => Math.max(max, e.y + e.h), area.y - 4);
  const y = bottom + 4;
  if (y + h <= area.y + area.h + 0.01) return { x: area.x, y: roundMm(y), fits: true };
  return { x: area.x, y: area.y, fits: false };
}

/** Coloca y ajusta un elemento nuevo a la zona imprimible. */
export function placeElement<T extends ExamElement>(el: T, page: ExamPage, settings: DocSettings, at?: { x: number; y: number }): T {
  const area = printableArea(settings);
  if (el.w > area.w) {
    const ratio = area.w / el.w;
    el.w = roundMm(area.w);
    if (el.type === "image" && el.lockAspect) el.h = roundMm(el.h * ratio);
  }
  if (at) {
    el.x = roundMm(Math.min(Math.max(at.x, 0), area.pageW - Math.min(el.w, area.pageW)));
    el.y = roundMm(Math.min(Math.max(at.y, 0), area.pageH - Math.min(el.h, area.pageH)));
  } else {
    const pos = findInsertPosition(page, settings, el.w, el.h);
    el.x = pos.x;
    el.y = pos.y;
  }
  return el;
}
