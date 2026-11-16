import { z } from "zod";
import type { ExamDocument } from "./types";

/** Validación estricta del documento al guardar o importar proyectos. */

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const str = (max = 20000) => z.string().max(max);
const color = z.string().max(40);
const fontId = z.enum([
  "inter",
  "atkinson",
  "merriweather",
  "lora",
  "robotoSlab",
  "comicNeue",
  "patrickHand",
  "bangers",
  "openDyslexic",
  "arial",
  "georgia",
  "times",
]);
const fontOrInherit = z.union([fontId, z.literal("inherit")]);

const rect = z.object({ x: num(0, 1), y: num(0, 1), w: num(0.0001, 1), h: num(0.0001, 1) });

const border = z.object({
  width: num(0, 20),
  color,
  radius: num(0, 100),
  style: z.enum(["solid", "dashed", "dotted"]),
});

const imageSource = z.object({
  comicId: str(64),
  pageId: str(64),
  selectionId: str(64).nullable(),
  crop: rect,
  pageWidth: num(1, 100000),
  pageHeight: num(1, 100000),
  label: str(300),
});

const base = {
  id: str(64),
  x: num(-1000, 2000),
  y: num(-1000, 2000),
  w: num(1, 2000),
  h: num(0.5, 2000),
  rotation: num(-360, 360),
  locked: z.boolean(),
};

const textStyle = z.object({
  fontFamily: fontOrInherit,
  fontSize: num(4, 200),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  align: z.enum(["left", "center", "right", "justify"]),
  lineHeight: num(0.5, 4),
  color,
  background: color.nullable(),
  padding: num(0, 50),
});

const lineStyle = z.enum(["solid", "dotted", "dashed"]);

const element = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("text"), text: str(), style: textStyle, border }),
  z.object({
    ...base,
    type: z.literal("image"),
    src: imageSource,
    fit: z.enum(["contain", "cover", "fill"]),
    lockAspect: z.boolean(),
    border,
    caption: str(500),
    opacity: num(0, 1),
  }),
  z.object({
    ...base,
    type: z.literal("question"),
    kind: z.enum(["short", "long", "multiple", "truefalse", "match", "image"]),
    number: str(20).nullable(),
    prompt: str(),
    points: num(0, 1000).nullable(),
    lines: z.number().int().min(0).max(80),
    lineSpacing: num(4, 30),
    lineStyle,
    options: z.array(str(1000)).max(26),
    optionColumns: z.number().int().min(0).max(4),
    statements: z.array(str(1000)).max(40),
    pairs: z.array(z.object({ left: str(500), right: str(500) })).max(26),
    shuffleSeed: z.number().int().min(0).max(2147483647).optional(),
    autoLines: z.boolean().optional(),
    image: imageSource.nullable(),
    imageHeight: num(5, 300),
    fontFamily: fontOrInherit,
    fontSize: num(4, 72),
    color,
    border,
  }),
  z.object({
    ...base,
    type: z.literal("lines"),
    count: z.number().int().min(1).max(100),
    spacing: num(3, 40),
    lineStyle,
    color,
    thickness: num(0.1, 5),
  }),
  z.object({ ...base, type: z.literal("box"), label: str(500), border, background: color.nullable(), grid: num(0, 30) }),
  z.object({
    ...base,
    type: z.literal("table"),
    rows: z.number().int().min(1).max(40),
    cols: z.number().int().min(1).max(12),
    cells: z.array(z.array(str(2000)).max(12)).max(40),
    headerRow: z.boolean(),
    fontSize: num(4, 48),
    borderColor: color,
  }),
  z.object({
    ...base,
    type: z.literal("shape"),
    shape: z.enum(["rect", "ellipse", "hline", "vline", "divider"]),
    stroke: color,
    strokeWidth: num(0, 20),
    dash: lineStyle,
    fill: color.nullable(),
    radius: num(0, 100),
    title: str(300),
  }),
  z.object({
    ...base,
    type: z.literal("examHeader"),
    variant: z.enum(["boxed", "simple"]),
    showName: z.boolean(),
    showCourse: z.boolean(),
    showDate: z.boolean(),
    showScore: z.boolean(),
    showInstructions: z.boolean(),
  }),
]);

const headerFooter = z.object({ enabled: z.boolean(), left: str(300), center: str(300), right: str(300) });

export const documentSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    title: str(300),
    subject: str(300),
    course: str(300),
    date: str(100),
    totalScore: num(0, 10000).nullable(),
    instructions: str(),
  }),
  settings: z.object({
    orientation: z.enum(["portrait", "landscape"]),
    margins: z.object({ top: num(0, 80), right: num(0, 80), bottom: num(0, 80), left: num(0, 80) }),
    showPageNumbers: z.boolean(),
    pageNumberFormat: z.enum(["n", "n-total", "pagina-n-de-total"]),
    pageNumberPosition: z.enum(["center", "right", "left"]),
    header: headerFooter,
    footer: headerFooter,
    fontFamily: fontId,
    showPoints: z.boolean(),
  }),
  pages: z
    .array(z.object({ id: str(64), elements: z.array(element).max(500) }))
    .min(1)
    .max(200),
});

export function parseDocument(input: unknown): ExamDocument {
  return documentSchema.parse(input) as ExamDocument;
}

export function safeParseDocument(input: unknown): { ok: true; doc: ExamDocument } | { ok: false; error: string } {
  const r = documentSchema.safeParse(input);
  if (r.success) return { ok: true, doc: r.data as ExamDocument };
  const issue = r.error.issues[0];
  return { ok: false, error: `Documento no válido en ${issue?.path.join(".") || "raíz"}: ${issue?.message ?? ""}` };
}
