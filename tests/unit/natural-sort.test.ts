import { describe, expect, it } from "vitest";
import { naturalCompare, naturalSort } from "@/lib/archive/natural-sort";

describe("ordenación natural de páginas", () => {
  it("ordena números como números, no como texto", () => {
    const names = ["pagina 10.jpg", "pagina 2.jpg", "pagina 1.jpg", "pagina 21.jpg", "pagina 3.jpg"];
    expect(naturalSort(names, (x) => x)).toEqual(["pagina 1.jpg", "pagina 2.jpg", "pagina 3.jpg", "pagina 10.jpg", "pagina 21.jpg"]);
  });

  it("respeta los ceros a la izquierda y mezcla de formatos", () => {
    const names = ["010.png", "009.jpg", "001.jpg", "100.webp", "011.jpg"];
    expect(naturalSort(names, (x) => x)).toEqual(["001.jpg", "009.jpg", "010.png", "011.jpg", "100.webp"]);
  });

  it("ignora mayúsculas y acentos", () => {
    expect(naturalCompare("Página 2.jpg", "pagina 10.jpg")).toBeLessThan(0);
    expect(naturalCompare("CAP 1/P2.jpg", "cap 1/p1.jpg")).toBeGreaterThan(0);
  });

  it("ordena por carpetas (capítulos) y luego por página", () => {
    const names = ["Cap 2/p1.jpg", "Cap 10/p1.jpg", "Cap 1/p10.jpg", "Cap 1/p2.jpg"];
    expect(naturalSort(names, (x) => x)).toEqual(["Cap 1/p2.jpg", "Cap 1/p10.jpg", "Cap 2/p1.jpg", "Cap 10/p1.jpg"]);
  });

  it("acepta separadores de Windows", () => {
    expect(naturalSort(["a\\10.jpg", "a\\9.jpg"], (x) => x)).toEqual(["a\\9.jpg", "a\\10.jpg"]);
  });
});
