import { describe, expect, it } from "vitest";
import { createDefaultDocument, createImage, createPage, createQuestion, createText } from "@/lib/document/factory";
import { domIssue, printDpi, reviewDocument } from "@/lib/document/review";
import type { ImageSource } from "@/lib/document/types";

const src = (w = 3000, h = 4500): ImageSource => ({
  comicId: "c1",
  pageId: "p1",
  selectionId: null,
  crop: { x: 0, y: 0, w: 1, h: 1 },
  pageWidth: w,
  pageHeight: h,
  label: "Cómic · pág. 1",
});

const kinds = (doc: ReturnType<typeof createDefaultDocument>) => reviewDocument(doc).map((i) => i.kind);

describe("revisión antes de exportar", () => {
  it("un examen nuevo no tiene problemas", () => {
    const doc = createDefaultDocument();
    doc.meta.totalScore = null;
    expect(reviewDocument(doc)).toEqual([]);
  });

  it("detecta elementos fuera de la hoja (error) y fuera de márgenes (aviso)", () => {
    const doc = createDefaultDocument();
    const a = createText();
    a.x = -20;
    a.y = 200;
    const b = createText();
    b.x = 8;
    b.y = 250;
    b.w = 100;
    doc.pages[0].elements.push(a, b);
    const issues = reviewDocument(doc);
    expect(issues.find((i) => i.elementId === a.id)?.kind).toBe("outsidePage");
    expect(issues.find((i) => i.elementId === a.id)?.severity).toBe("error");
    expect(issues.find((i) => i.elementId === b.id)?.kind).toBe("outsideMargins");
    // Los errores van antes que los avisos
    expect(issues[0].severity).toBe("error");
  });

  it("avisa si la nota total no coincide con la suma de las preguntas", () => {
    const doc = createDefaultDocument();
    const q = createQuestion("long");
    q.points = 2.5;
    q.y = 100;
    doc.pages[0].elements.push(q);
    doc.meta.totalScore = 10;
    const issue = reviewDocument(doc).find((i) => i.kind === "totalMismatch");
    expect(issue?.message).toContain("suman 2,5");
    doc.meta.totalScore = 2.5;
    expect(kinds(doc)).not.toContain("totalMismatch");
  });

  it("detecta hojas vacías, preguntas sobre imagen sin imagen y solapes", () => {
    const doc = createDefaultDocument();
    doc.meta.totalScore = null;
    const q = createQuestion("image");
    q.y = 70;
    const t = createText();
    t.y = 75;
    doc.pages[0].elements.push(q, t);
    doc.pages.push(createPage());
    const k = kinds(doc);
    expect(k).toContain("emptyPage");
    expect(k).toContain("imageQuestionWithoutImage");
    expect(k).toContain("overlap");
  });

  it("calcula la resolución de impresión y avisa si es baja", () => {
    expect(printDpi(src(3000, 4500), 100, 150)).toBe(762);
    const doc = createDefaultDocument();
    doc.meta.totalScore = null;
    const img = createImage(src(400, 600), 150, 225);
    img.x = 20;
    img.y = 65;
    doc.pages[0].elements.push(img);
    const issue = reviewDocument(doc).find((i) => i.kind === "lowDpi");
    expect(issue?.message).toMatch(/\d+ ppp/);
    img.w = 40;
    img.h = 60;
    expect(kinds(doc)).not.toContain("lowDpi");
  });

  it("describe los problemas medidos en el navegador con un nombre reconocible", () => {
    const doc = createDefaultDocument();
    const q = createQuestion("short");
    doc.pages[0].elements.push(q);
    expect(domIssue(doc, "clipped", q.id)?.message).toMatch(/^La pregunta 1 no cabe/);
    expect(domIssue(doc, "missingImage", "no-existe")).toBeNull();
  });
});
