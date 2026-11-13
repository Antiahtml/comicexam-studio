import type { Browser } from "playwright";

/**
 * Generación de PDF con Chromium (Playwright).
 *
 * Se renderiza la ruta /print/[id], que usa EXACTAMENTE los mismos componentes que el
 * editor, con medidas en mm y pt. Chromium genera un PDF vectorial (texto real, no capturas)
 * e incrusta las imágenes recortadas a su resolución original.
 */

const g = globalThis as unknown as { __pdfBrowser?: Promise<Browser> };

async function getBrowser(): Promise<Browser> {
  const existing = g.__pdfBrowser;
  if (existing) {
    try {
      const b = await existing;
      if (b.isConnected()) return b;
    } catch {
      /* se relanza */
    }
  }
  const { chromium } = await import("playwright");
  const launching = chromium.launch({ headless: true, args: ["--font-render-hinting=none", "--disable-dev-shm-usage"] });
  g.__pdfBrowser = launching;
  const browser = await launching;
  browser.on("disconnected", () => {
    if (g.__pdfBrowser === launching) g.__pdfBrowser = undefined;
  });
  return browser;
}

export class PdfError extends Error {}

export interface RenderPdfOptions {
  /** URL absoluta de la vista de impresión. */
  url: string;
  timeoutMs?: number;
}

export async function renderPdfFromUrl({ url, timeoutMs = 120_000 }: RenderPdfOptions): Promise<Buffer> {
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    throw new PdfError(
      `No se ha podido iniciar Chromium para generar el PDF. Ejecuta "npx playwright install chromium". (${(err as Error).message.split("\n")[0]})`,
    );
  }
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(timeoutMs);
    await page.emulateMedia({ media: "print" });
    const res = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    if (!res || !res.ok()) throw new PdfError(`La vista de impresión respondió con estado ${res?.status() ?? "desconocido"}.`);
    // La vista marca window.__PRINT_READY__ cuando todas las fuentes e imágenes están cargadas.
    // En modo desarrollo la página puede recargarse una vez (recompilación): se reintenta.
    for (let attempt = 1; ; attempt++) {
      try {
        await page.waitForFunction("window.__PRINT_READY__ === true", undefined, { timeout: timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
        const state = (await page.evaluate("({ ready: window.__PRINT_READY__ === true, errors: window.__PRINT_ERRORS__ || 0 })")) as {
          ready: boolean;
          errors: number;
        };
        if (!state.ready) throw new Error("Execution context was destroyed");
        if (state.errors > 0) console.warn(`[pdf] ${state.errors} imagen(es) no se pudieron cargar`);
        break;
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (attempt >= 4 || !/context was destroyed|navigation/i.test(msg)) throw err;
        await page.waitForLoadState("load").catch(() => undefined);
      }
    }
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    return Buffer.from(pdf);
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Nombre de archivo seguro para la cabecera Content-Disposition. */
export function safePdfFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const base = cleaned.replace(/\.pdf$/i, "") || "examen";
  return `${base}.pdf`;
}

export function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
