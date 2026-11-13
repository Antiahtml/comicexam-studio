/**
 * Modelo del documento de examen.
 *
 * Todas las posiciones y tamaños se expresan en MILÍMETROS respecto a la esquina
 * superior izquierda de la hoja. Los tamaños de letra se expresan en PUNTOS (pt).
 * El zoom del editor nunca modifica estos valores.
 */

import type { NormRect } from "../regions/coords";

export type Orientation = "portrait" | "landscape";

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type FontId =
  | "inter"
  | "atkinson"
  | "merriweather"
  | "lora"
  | "robotoSlab"
  | "comicNeue"
  | "patrickHand"
  | "bangers"
  | "openDyslexic"
  | "arial"
  | "georgia"
  | "times";

export interface HeaderFooter {
  enabled: boolean;
  left: string;
  center: string;
  right: string;
}

export interface DocSettings {
  orientation: Orientation;
  margins: Margins;
  showPageNumbers: boolean;
  pageNumberFormat: "n" | "n-total" | "pagina-n-de-total";
  pageNumberPosition: "center" | "right" | "left";
  header: HeaderFooter;
  footer: HeaderFooter;
  fontFamily: FontId;
  /** Muestra la puntuación de cada pregunta junto al enunciado. */
  showPoints: boolean;
}

export interface ExamMeta {
  title: string;
  subject: string;
  course: string;
  date: string;
  totalScore: number | null;
  instructions: string;
}

export type TextAlign = "left" | "center" | "right" | "justify";

export interface TextStyle {
  fontFamily: FontId | "inherit";
  /** pt */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  lineHeight: number;
  color: string;
  background: string | null;
  /** mm */
  padding: number;
}

export interface BorderStyle {
  /** pt (0 = sin borde) */
  width: number;
  color: string;
  /** mm */
  radius: number;
  style: "solid" | "dashed" | "dotted";
}

interface BaseElement {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** grados */
  rotation: number;
  locked: boolean;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  style: TextStyle;
  border: BorderStyle;
}

/** Referencia a una imagen de la biblioteca: página de un cómic + región normalizada. */
export interface ImageSource {
  comicId: string;
  pageId: string;
  /** Viñeta de la biblioteca de la que procede (si la hay). */
  selectionId: string | null;
  crop: NormRect;
  /** Dimensiones de la página original en píxeles (para calcular la relación de aspecto). */
  pageWidth: number;
  pageHeight: number;
  /** Texto de referencia: "Mi cómic · pág. 12". */
  label: string;
}

export type ImageFit = "contain" | "cover" | "fill";

export interface ImageElement extends BaseElement {
  type: "image";
  src: ImageSource;
  fit: ImageFit;
  lockAspect: boolean;
  border: BorderStyle;
  caption: string;
  opacity: number;
}

export type QuestionKind = "short" | "long" | "multiple" | "truefalse" | "match" | "image";

export interface QuestionElement extends BaseElement {
  type: "question";
  kind: QuestionKind;
  /** Número manual. Si es null, se numera automáticamente. */
  number: string | null;
  prompt: string;
  points: number | null;
  /** Líneas de respuesta (respuesta corta/larga/imagen). */
  lines: number;
  /** mm entre líneas */
  lineSpacing: number;
  lineStyle: "solid" | "dotted" | "dashed";
  /** Opciones (opción múltiple). */
  options: string[];
  optionColumns: number;
  /** Afirmaciones (verdadero/falso). */
  statements: string[];
  /** Parejas (relacionar conceptos). */
  pairs: { left: string; right: string }[];
  /** Imagen asociada (pregunta basada en imagen). */
  image: ImageSource | null;
  /** mm */
  imageHeight: number;
  fontFamily: FontId | "inherit";
  /** pt */
  fontSize: number;
  color: string;
  border: BorderStyle;
}

export interface LinesElement extends BaseElement {
  type: "lines";
  count: number;
  /** mm */
  spacing: number;
  lineStyle: "solid" | "dotted" | "dashed";
  color: string;
  /** pt */
  thickness: number;
}

export interface BoxElement extends BaseElement {
  type: "box";
  label: string;
  border: BorderStyle;
  background: string | null;
  /** Cuadrícula interior (cuaderno). 0 = sin cuadrícula. mm */
  grid: number;
}

export interface TableElement extends BaseElement {
  type: "table";
  rows: number;
  cols: number;
  cells: string[][];
  headerRow: boolean;
  /** pt */
  fontSize: number;
  borderColor: string;
}

export type ShapeKind = "rect" | "ellipse" | "hline" | "vline" | "divider";

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: ShapeKind;
  stroke: string;
  /** pt */
  strokeWidth: number;
  dash: "solid" | "dashed" | "dotted";
  fill: string | null;
  /** mm */
  radius: number;
  /** Título del separador de sección. */
  title: string;
}

/** Bloque de cabecera del examen: título, asignatura, curso, fecha, nombre, nota e instrucciones. */
export interface ExamHeaderElement extends BaseElement {
  type: "examHeader";
  variant: "boxed" | "simple";
  showName: boolean;
  showCourse: boolean;
  showDate: boolean;
  showScore: boolean;
  showInstructions: boolean;
}

export type ExamElement =
  | TextElement
  | ImageElement
  | QuestionElement
  | LinesElement
  | BoxElement
  | TableElement
  | ShapeElement
  | ExamHeaderElement;

export type ElementType = ExamElement["type"];

export interface ExamPage {
  id: string;
  elements: ExamElement[];
}

export interface ExamDocument {
  version: 1;
  meta: ExamMeta;
  settings: DocSettings;
  pages: ExamPage[];
}
