import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { contentDisposition, renderPdfFromUrl, safePdfFileName } from "@/lib/pdf/render";

/**
 * Exportación: Chromium debe generar un PDF A4 exacto, una página por hoja, esperando a que
 * la vista indique que está lista (fuentes e imágenes cargadas).
 */
let server: http.Server;
let base = "";

const html = (orientation: "portrait" | "landscape") => {
  const [w, h] = orientation === "portrait" ? [210, 297] : [297, 210];
  return `<!doctype html><html><head><style>
    @page { size: ${w}mm ${h}mm; margin: 0 } body { margin: 0 }
    .p { width: ${w}mm; height: ${h}mm; position: relative; break-after: page; overflow: hidden }
    .p:last-child { break-after: auto }
  </style></head><body>
    <div class="p"><div style="position:absolute;left:15mm;top:15mm;font:12pt sans-serif">Hoja 1</div></div>
    <div class="p"><div style="position:absolute;left:15mm;top:15mm;font:12pt sans-serif">Hoja 2</div></div>
    <div class="p"><div style="position:absolute;left:15mm;top:15mm;font:12pt sans-serif">Hoja 3</div></div>
    <script>setTimeout(() => { window.__PRINT_READY__ = true }, 150)</script>
  </body></html>`;
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html(req.url?.includes("landscape") ? "landscape" : "portrait"));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(() => {
  server.close();
});

describe("exportación del documento a PDF", () => {
  it("genera un PDF A4 vertical con una página por hoja", async () => {
    const pdf = await renderPdfFromUrl({ url: `${base}/portrait` });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(3);
    for (const p of doc.getPages()) {
      // 210 × 297 mm = 595,28 × 841,89 pt
      expect(p.getWidth()).toBeCloseTo(595.3, 0);
      expect(p.getHeight()).toBeCloseTo(841.9, 0);
    }
  });

  it("respeta la orientación horizontal", async () => {
    const doc = await PDFDocument.load(await renderPdfFromUrl({ url: `${base}/landscape` }));
    expect(doc.getPage(0).getWidth()).toBeCloseTo(841.9, 0);
    expect(doc.getPage(0).getHeight()).toBeCloseTo(595.3, 0);
  });

  it("limpia el nombre del archivo", () => {
    expect(safePdfFileName("Examen: tema 1/2?")).toBe("Examen tema 1 2.pdf");
    expect(safePdfFileName("  ")).toBe("examen.pdf");
    expect(safePdfFileName("Comprensión.pdf")).toBe("Comprensión.pdf");
    expect(contentDisposition("Comprensión lectora.pdf", false)).toContain("filename*=UTF-8''Comprensi%C3%B3n%20lectora.pdf");
  });
});
