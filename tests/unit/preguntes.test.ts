import { describe, expect, it } from "vitest";
import { matchOrder, matchSolution, newShuffleSeed } from "@/lib/document/match";
import { createDefaultDocument, createQuestion } from "@/lib/document/factory";
import { parseDocument } from "@/lib/document/schema";

describe("relacionar conceptes: columna B barrejada", () => {
  it("sense llavor o amb una sola parella no es barreja", () => {
    expect(matchOrder(4, 0)).toEqual([0, 1, 2, 3]);
    expect(matchOrder(4, undefined)).toEqual([0, 1, 2, 3]);
    expect(matchOrder(1, 123)).toEqual([0]);
  });

  it("és una permutació estable (mateixa llavor, mateix ordre)", () => {
    for (const n of [2, 3, 5, 8, 26]) {
      const a = matchOrder(n, 987654321);
      expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(matchOrder(n, 987654321)).toEqual(a);
    }
  });

  it("cap parella queda a la seva pròpia fila, per a qualsevol llavor", () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const n of [2, 3, 4, 7]) {
        matchOrder(n, seed).forEach((pairIndex, pos) => expect(pairIndex).not.toBe(pos));
      }
    }
  });

  it("la solució indica on ha quedat la parella de cada concepte", () => {
    const n = 5;
    const order = matchOrder(n, 4242);
    const sol = matchSolution(n, 4242);
    sol.forEach((pos, concept) => expect(order[pos]).toBe(concept));
  });

  it("genera llavors enteres positives", () => {
    const s = newShuffleSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });
});

describe("valors per defecte de les preguntes", () => {
  it("les opcions múltiples es reparteixen soles (0 = automàtic)", () => {
    expect(createQuestion("multiple").optionColumns).toBe(0);
  });

  it("resposta llarga i imatge tenen línies automàtiques; la curta no", () => {
    expect(createQuestion("long").autoLines).toBe(true);
    expect(createQuestion("image").autoLines).toBe(true);
    expect(createQuestion("short").autoLines).toBeUndefined();
  });

  it("relacionar neix amb la columna B barrejada", () => {
    expect(createQuestion("match").shuffleSeed).toBeGreaterThan(0);
  });

  it("els camps nous es validen i es conserven en desar", () => {
    const doc = createDefaultDocument("Prova");
    const q = createQuestion("match");
    doc.pages[0].elements.push(q, createQuestion("multiple"), createQuestion("long"));
    const back = parseDocument(JSON.parse(JSON.stringify(doc)));
    const els = back.pages[0].elements.filter((e) => e.type === "question");
    expect(els.map((e) => (e.type === "question" ? e.optionColumns : -1))).toContain(0);
    expect(els.find((e) => e.type === "question" && e.kind === "match")).toMatchObject({ shuffleSeed: q.shuffleSeed });
    expect(els.find((e) => e.type === "question" && e.kind === "long")).toMatchObject({ autoLines: true });
  });

  it("els exàmens antics (sense els camps nous) continuen sent vàlids", () => {
    const doc = createDefaultDocument("Antic");
    const q = createQuestion("long");
    delete (q as { autoLines?: boolean }).autoLines;
    doc.pages[0].elements.push(q);
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });
});
