/**
 * Crea datos de ejemplo:
 *   1. Importa fixtures/demo-comic.cbr (cómic de prueba de 48 páginas) con el MISMO proceso que la app.
 *   2. Guarda varias viñetas en la biblioteca.
 *   3. Crea el examen «Comprensión lectora — Cómic (ejemplo)» de dos hojas.
 *   4. Exporta el proyecto a examples/comprension-lectora.comicexam.
 *
 * Uso: npm run seed   (requiere haber ejecutado antes `npm run setup` y `npm run fixtures`)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { config } from "../src/lib/config";
import { processArchive } from "../src/lib/comics/import";
import {
  createDefaultDocument,
  createImage,
  createPage,
  createQuestion,
  createShape,
  createText,
  findInsertPosition,
} from "../src/lib/document/factory";
import { createProject } from "../src/lib/projects/repository";
import { exportProjectBundle } from "../src/lib/projects/bundle";
import { printableArea, roundMm } from "../src/lib/document/units";
import type { ExamElement, ExamPage, ImageSource } from "../src/lib/document/types";
import type { NormRect } from "../src/lib/regions/coords";

const FIXTURE = path.resolve(process.cwd(), "fixtures/demo-comic.cbr");
const PROJECT_NAME = "Comprensión lectora — Cómic (ejemplo)";

/** Viñetas de las páginas generadas (1000×1500 px, márgenes 40 px, calle 24 px). */
function panelRect(page: number, row: number, col: number): NormRect {
  const W = 1000;
  const H = 1500;
  const m = 40;
  const g = 24;
  const rows = page % 3 === 0 ? [1, 2, 1] : page % 3 === 1 ? [2, 1, 2] : [2, 2, 1];
  const rh = (H - 2 * m - g * (rows.length - 1)) / rows.length;
  const cw = (W - 2 * m - g * (rows[row] - 1)) / rows[row];
  const pad = 4;
  const x = m + col * (cw + g) - pad;
  const y = m + row * (rh + g) - pad;
  return { x: x / W, y: y / H, w: (cw + 2 * pad) / W, h: (rh + 2 * pad) / H };
}

async function ensureComic() {
  const existing = await prisma.comic.findFirst({ where: { originalName: "demo-comic.cbr", status: "ready" } });
  if (existing) return existing;
  await fs.access(FIXTURE).catch(() => {
    throw new Error("No existe fixtures/demo-comic.cbr. Ejecuta antes: npm run fixtures");
  });
  const comic = await prisma.comic.create({
    data: { title: "Las aventuras de Lía (ejemplo)", originalName: "demo-comic.cbr", format: "rar", stage: "En cola…" },
  });
  const tmpDir = path.join(config.dataDir, "tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, `seed-${comic.id}.cbr`);
  await fs.copyFile(FIXTURE, tmp);
  await processArchive(comic.id, tmp, "rar");
  await fs.rm(tmp, { force: true });
  const done = await prisma.comic.findUniqueOrThrow({ where: { id: comic.id } });
  if (done.status !== "ready") throw new Error(`Error al importar: ${done.error}`);
  return done;
}

async function main() {
  const comic = await ensureComic();
  console.log(`✔ Cómic: ${comic.title} (${comic.pageCount} páginas)`);

  const pageByNumber = async (n: number) => prisma.comicPage.findFirstOrThrow({ where: { comicId: comic.id, index: n - 1 } });
  const select = async (pageNo: number, row: number, col: number, label: string): Promise<ImageSource> => {
    const page = await pageByNumber(pageNo);
    const rect = panelRect(pageNo, row, col);
    let sel = await prisma.selection.findFirst({ where: { pageId: page.id, label } });
    sel ??= await prisma.selection.create({ data: { comicId: comic.id, pageId: page.id, label, ...rect } });
    return {
      comicId: comic.id,
      pageId: page.id,
      selectionId: sel.id,
      crop: { x: sel.x, y: sel.y, w: sel.w, h: sel.h },
      pageWidth: page.width,
      pageHeight: page.height,
      label: `${comic.title} · pág. ${pageNo}`,
    };
  };

  const v12 = await select(12, 1, 0, "Pág. 12 · Lía en el bosque");
  const v20a = await select(20, 0, 0, "Pág. 20 · Antes");
  const v20b = await select(20, 0, 1, "Pág. 20 · Después");
  const v7 = await select(7, 1, 0, "Pág. 7 · La llegada");
  console.log("✔ Viñetas guardadas en la biblioteca");

  const existing = await prisma.project.findFirst({ where: { name: PROJECT_NAME } });
  if (existing) await prisma.project.delete({ where: { id: existing.id } });

  const doc = createDefaultDocument("Comprensión lectora — Cómic");
  doc.meta.subject = "Lengua castellana y Literatura";
  doc.meta.course = "2.º ESO";
  doc.meta.instructions = "Observa con atención cada viñeta antes de responder. Escribe con letra clara y frases completas.";
  doc.settings.footer = { enabled: true, left: "{asignatura} · {curso}", center: "", right: "" };
  const area = printableArea(doc.settings);

  const add = (page: ExamPage, el: ExamElement, gap = 4) => {
    const pos = findInsertPosition(page, doc.settings, el.w, el.h);
    el.x = el.x || pos.x;
    el.y = roundMm(pos.y + gap - 4);
    page.elements.push(el);
    return el;
  };

  // Hoja 1: una viñeta y su pregunta
  const p1 = doc.pages[0];
  const img = createImage(v12, 95, 90);
  img.x = roundMm(area.x + (area.w - img.w) / 2);
  add(p1, img, 6);
  const q1 = createQuestion("long");
  q1.prompt = "¿Qué está ocurriendo en esta escena? Describe lo que hace el personaje.";
  q1.points = 2;
  q1.lines = 4;
  q1.h = 44;
  add(p1, q1, 5);
  const q2 = createQuestion("multiple");
  q2.prompt = "¿Qué emoción crees que siente Lía en esta viñeta?";
  q2.options = ["Alegría", "Miedo", "Sorpresa", "Enfado"];
  q2.optionColumns = 4;
  q2.points = 1;
  q2.h = 18;
  add(p1, q2, 3);

  // Hoja 2: comparar dos escenas
  const p2 = createPage();
  doc.pages.push(p2);
  const div = createShape("divider");
  div.title = "Comparar escenas";
  div.x = area.x;
  div.y = area.y;
  p2.elements.push(div);
  const gap = 6;
  const aspectA = (v20a.crop.w * v20a.pageWidth) / (v20a.crop.h * v20a.pageHeight);
  const aspectB = (v20b.crop.w * v20b.pageWidth) / (v20b.crop.h * v20b.pageHeight);
  const h = Math.min(70, (area.w - gap) / (aspectA + aspectB));
  const a = createImage(v20a, h * aspectA, h);
  const b = createImage(v20b, h * aspectB, h);
  const rowW = a.w + gap + b.w;
  a.x = roundMm(area.x + (area.w - rowW) / 2);
  b.x = roundMm(a.x + a.w + gap);
  a.y = b.y = roundMm(area.y + 14);
  a.caption = "Escena A";
  b.caption = "Escena B";
  p2.elements.push(a, b);
  const q3 = createQuestion("long");
  q3.prompt = "Compara las dos escenas: ¿qué ha cambiado entre la escena A y la escena B?";
  q3.points = 2;
  q3.lines = 4;
  q3.h = 44;
  add(p2, q3, 6);
  const q4 = createQuestion("truefalse");
  q4.prompt = "Indica si las siguientes afirmaciones son verdaderas (V) o falsas (F).";
  q4.statements = ["En la escena A es de día.", "Lía aparece en las dos escenas.", "Hay más de tres personajes."];
  q4.points = 1.5;
  q4.h = 30;
  add(p2, q4, 3);
  const q5 = createQuestion("image");
  q5.prompt = "Observa esta viñeta de la página 7 e inventa qué dice el personaje.";
  q5.image = v7;
  q5.imageHeight = 45;
  q5.lines = 2;
  q5.points = 1.5;
  q5.h = 72;
  add(p2, q5, 3);
  const note = createText("note");
  note.text = "Recuerda revisar la ortografía antes de entregar.";
  note.w = area.w;
  add(p2, note, 3);
  doc.meta.totalScore = 8;

  const project = await createProject(PROJECT_NAME, doc);
  console.log(`✔ Examen de ejemplo: ${project.name}  →  http://localhost:3000/editor/${project.id}`);

  const bundle = await exportProjectBundle(project.id);
  await fs.mkdir(path.resolve(process.cwd(), "examples"), { recursive: true });
  const out = path.resolve(process.cwd(), "examples/comprension-lectora.comicexam");
  await fs.writeFile(out, bundle.data);
  console.log(`✔ Proyecto exportado en examples/comprension-lectora.comicexam (${(bundle.data.byteLength / 1024).toFixed(0)} KB)`);
}

main()
  .catch((err) => {
    console.error("✖", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
