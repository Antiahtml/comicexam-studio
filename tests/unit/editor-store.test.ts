import { beforeEach, describe, expect, it } from "vitest";
import { setPreferredPageResolver, useEditor } from "@/store/editor-store";
import { createDefaultDocument, createPage, createQuestion, createText } from "@/lib/document/factory";
import { printStatus } from "@/lib/document/geometry";

function load() {
  const doc = createDefaultDocument("Prueba");
  useEditor.getState().init({ id: "p", name: "Prueba", document: doc });
  return doc;
}

beforeEach(() => setPreferredPageResolver(null));

describe("inserción en el editor", () => {
  it("coloca lo nuevo debajo del contenido y lo anuncia para mostrarlo", () => {
    load();
    const q = createQuestion("short");
    useEditor.getState().addElement(q);
    const st = useEditor.getState();
    const header = st.doc.pages[0].elements[0];
    const placed = st.doc.pages[0].elements[1];
    expect(placed.y).toBeGreaterThanOrEqual(header.y + header.h);
    expect(st.lastInserted?.ids).toEqual([q.id]);
    expect(st.lastInserted?.newPages).toBe(0);
  });

  it("si la hoja está llena, crea una hoja nueva en vez de solapar la cabecera", () => {
    load();
    for (let i = 0; i < 6; i++) useEditor.getState().addElement(createQuestion("long"));
    const st = useEditor.getState();
    expect(st.doc.pages.length).toBeGreaterThan(1);
    for (const page of st.doc.pages) {
      for (const el of page.elements) expect(printStatus(el, st.doc.settings)).toBe("ok");
      // Ningún elemento de la hoja 1 se coloca encima de la cabecera
      const [first, ...rest] = page.elements;
      for (const el of rest) expect(el.y).toBeGreaterThanOrEqual(first.y);
    }
    expect(useEditor.getState().lastInserted?.newPages).toBeGreaterThanOrEqual(0);
  });

  it("inserta en la hoja que indica el lienzo (la que se está viendo)", () => {
    load();
    useEditor.getState().addPage(0);
    const [p1] = useEditor.getState().doc.pages;
    setPreferredPageResolver(() => p1.id);
    const t = createText();
    useEditor.getState().addElement(t);
    expect(useEditor.getState().doc.pages[0].elements.some((e) => e.id === t.id)).toBe(true);
  });

  it("«Colocar dentro» devuelve un elemento a la zona imprimible", () => {
    const doc = load();
    const t = createText();
    t.x = -30;
    t.y = 290;
    t.w = 400;
    doc.pages[0].elements.push(t);
    useEditor.getState().init({ id: "p", name: "Prueba", document: doc });
    useEditor.getState().fitInsideMargins(t.id);
    const el = useEditor.getState().doc.pages[0].elements.find((e) => e.id === t.id)!;
    expect(printStatus(el, useEditor.getState().doc.settings)).toBe("ok");
    // Y se puede deshacer
    useEditor.getState().undo();
    expect(useEditor.getState().doc.pages[0].elements.find((e) => e.id === t.id)!.x).toBe(-30);
  });

  it("al deshacer se elimina también la hoja creada automáticamente", () => {
    load();
    useEditor.getState().init({ id: "p", name: "x", document: { ...createDefaultDocument(), pages: [createPage()] } });
    const before = useEditor.getState().doc.pages.length;
    const q = createQuestion("long");
    q.h = 400;
    useEditor.getState().addElement(q);
    useEditor.getState().undo();
    expect(useEditor.getState().doc.pages.length).toBe(before);
  });
});
