import { describe, expect, it } from "vitest";
import { createDefaultDocument, createImage, createLines, createQuestion, createText, findInsertPosition, placeElement } from "@/lib/document/factory";
import { documentSchema, parseDocument, safeParseDocument } from "@/lib/document/schema";
import { findOverlaps, printStatus, questionNumbers, snapBox, totalPoints, alignBoxes } from "@/lib/document/geometry";
import { PX_PER_MM, mmToPx, pageSize, printableArea, pxToMm } from "@/lib/document/units";

const src = { comicId: "c1", pageId: "p1", selectionId: null, crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, pageWidth: 2000, pageHeight: 3000, label: "Cómic · pág. 1" };

describe("modelo del documento", () => {
  it("el documento por defecto es válido y tiene una hoja con cabecera", () => {
    const doc = createDefaultDocument("Prueba");
    expect(() => parseDocument(doc)).not.toThrow();
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].elements[0].type).toBe("examHeader");
    expect(doc.meta.title).toBe("Prueba");
  });

  it("rechaza documentos manipulados", () => {
    const doc = createDefaultDocument();
    const bad = structuredClone(doc) as unknown as { pages: { elements: { type: string }[] }[] };
    bad.pages[0].elements[0].type = "script";
    expect(safeParseDocument(bad).ok).toBe(false);
    expect(documentSchema.safeParse({ ...doc, pages: [] }).success).toBe(false);
  });

  it("las unidades son independientes del zoom", () => {
    expect(mmToPx(210, 1)).toBeCloseTo(793.7, 1);
    expect(pxToMm(mmToPx(123.4, 2.5), 2.5)).toBeCloseTo(123.4);
    expect(PX_PER_MM).toBeCloseTo(3.7795, 3);
    expect(pageSize("landscape")).toEqual({ width: 297, height: 210 });
  });

  it("las imágenes respetan la relación de aspecto del recorte", () => {
    const img = createImage(src, 100, 200);
    expect(img.w / img.h).toBeCloseTo((0.5 * 2000) / (0.5 * 3000), 1);
  });

  it("coloca los elementos nuevos debajo del contenido existente", () => {
    const doc = createDefaultDocument();
    const page = doc.pages[0];
    const header = page.elements[0];
    const q = placeElement(createQuestion("long"), page, doc.settings);
    expect(q.y).toBeGreaterThanOrEqual(header.y + header.h);
    expect(q.x).toBe(doc.settings.margins.left);
    page.elements.push(q);
    const pos = findInsertPosition(page, doc.settings, 180, 400);
    expect(pos.fits).toBe(false);
  });
});

describe("avisos de maquetación", () => {
  it("detecta elementos fuera de márgenes y de la hoja", () => {
    const doc = createDefaultDocument();
    const t = createText();
    t.x = 15;
    t.y = 20;
    expect(printStatus(t, doc.settings)).toBe("ok");
    t.x = 5;
    expect(printStatus(t, doc.settings)).toBe("outsideMargins");
    t.x = -10;
    expect(printStatus(t, doc.settings)).toBe("outsidePage");
  });

  it("detecta solapes entre elementos (no entre fondos decorativos)", () => {
    const a = createText();
    const b = createLines(3);
    a.x = b.x = 20;
    a.y = 20;
    b.y = 25;
    const overlaps = findOverlaps({ id: "p", elements: [a, b] });
    expect(overlaps.get(a.id)).toEqual([b.id]);
    b.y = 60;
    expect(findOverlaps({ id: "p", elements: [a, b] }).size).toBe(0);
  });

  it("numera las preguntas por hoja y posición, respetando números manuales", () => {
    const doc = createDefaultDocument();
    const q1 = createQuestion("short");
    const q2 = createQuestion("long");
    const q3 = createQuestion("multiple");
    q1.y = 120;
    q2.y = 60;
    q3.number = "Extra";
    doc.pages[0].elements.push(q1, q2);
    doc.pages.push({ id: "p2", elements: [q3] });
    const n = questionNumbers(doc);
    expect(n.get(q2.id)).toBe("1");
    expect(n.get(q1.id)).toBe("2");
    expect(n.get(q3.id)).toBe("Extra");
    expect(totalPoints(doc)).toBe(3);
  });

  it("ajuste magnético a los márgenes", () => {
    const doc = createDefaultDocument();
    const area = printableArea(doc.settings);
    const snap = snapBox({ x: area.x + 1.2, y: 100, w: 50, h: 20 }, [], doc.settings, 2);
    expect(snap.dx).toBeCloseTo(-1.2);
    expect(snap.guidesX).toEqual([area.x]);
  });

  it("alinea respecto a la zona imprimible", () => {
    const doc = createDefaultDocument();
    const [b] = alignBoxes([{ x: 40, y: 40, w: 50, h: 10 }], "hcenter", doc.settings);
    expect(b.x).toBeCloseTo((210 - 50) / 2);
  });
});
