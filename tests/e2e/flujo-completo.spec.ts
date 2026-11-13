import path from "node:path";
import fs from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";

/**
 * Flujo completo del caso de uso real:
 * importar CBR → abrir pág. 12 → seleccionar viñeta → insertarla → pregunta + 4 líneas →
 * pág. 20: dos viñetas una junto a otra → segunda hoja → guardar → reabrir → vista previa → PDF.
 */

const FIXTURE = path.resolve(__dirname, "../../fixtures/demo-comic.cbr");

async function drawRegion(page: Page, layer: Locator, from: [number, number], to: [number, number]) {
  const box = (await layer.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 10 });
  await page.mouse.up();
}

async function closeViewer(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
}

async function openViewerAt(page: Page, pageNumber: number) {
  await page.getByTestId("left-tab-comics").click();
  await page.getByTestId("editor-comic-item").first().click();
  await page.getByTestId("comic-page-thumb").nth(pageNumber - 1).click();
  const viewer = page.getByTestId("comic-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByLabel("Número de página")).toHaveValue(String(pageNumber));
  return viewer;
}

test("importar cómic → seleccionar viñeta → insertar → pregunta → guardar → exportar PDF", async ({ page }) => {
  // 1. Importar el CBR (RAR5) desde la biblioteca
  await page.goto("/biblioteca");
  await page.getByTestId("comic-file-input").setInputFiles(FIXTURE);
  const card = page.getByTestId("comic-card").filter({ hasText: "48 págs." });
  await expect(card).toBeVisible({ timeout: 90_000 });

  // 2. Crear el examen
  await page.goto("/");
  await page.getByTestId("new-exam").click();
  await page.getByTestId("new-exam-name").fill("Comprensión lectora — Cómic");
  await page.getByTestId("create-exam").click();
  await page.waitForURL(/\/editor\//);
  await expect(page.getByTestId("exam-page-1")).toBeVisible();

  // 3-5. Abrir la página 12, seleccionar una viñeta con el ratón y añadirla al examen
  let viewer = await openViewerAt(page, 12);
  await drawRegion(page, viewer.getByTestId("region-layer"), [0.05, 0.33], [0.47, 0.66]);
  await expect(viewer.getByTestId("region-card")).toHaveCount(1);
  await viewer.getByTestId("insert-region").click();
  await expect(viewer.getByText("Guardada")).toBeVisible();

  // Una segunda selección sin guardar no se pierde al cerrar: el visor pregunta qué hacer.
  await drawRegion(page, viewer.getByTestId("region-layer"), [0.55, 0.05], [0.9, 0.3]);
  await expect(viewer.getByText("Borrador", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); // primero solo deselecciona
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape"); // después intenta cerrar
  const choice = page.getByTestId("choice-dialog");
  await expect(choice).toContainText("Tienes 1 viñeta sin guardar");
  await choice.getByRole("button", { name: "Seguir seleccionando" }).click();
  await expect(viewer).toBeVisible();
  await closeViewer(page);
  await choice.getByRole("button", { name: "Guardar y salir" }).click();
  await expect(viewer).toBeHidden();
  const page1 = page.getByTestId("exam-page-1");
  await expect(page1.locator("[data-el-type=image]")).toHaveCount(1);

  // 6-7. Pregunta sobre la viñeta con cuatro líneas de respuesta
  await page.getByTestId("left-tab-questions").click();
  await page.getByTestId("tpl-Respuesta larga").click();
  await page.getByTestId("prop-prompt").fill("¿Qué está ocurriendo en esta escena?");
  await page.getByTestId("prop-lines").fill("4");
  await page.getByTestId("prop-lines").blur();
  await expect(page1.locator("[data-el-type=question]")).toContainText("¿Qué está ocurriendo en esta escena?");

  // Cambiar tamaño de la viñeta desde Propiedades (mm, independiente del zoom)
  await page1.locator("[data-el-type=image]").click();
  await page.getByTestId("prop-w").fill("70");
  await page.getByTestId("prop-w").blur();
  await expect(page1.locator("[data-el-type=image]")).toHaveCSS("width", /264\.5|264\.6/); // 70 mm a 96 ppp

  // 8-10. Página 20: dos viñetas una junto a otra
  viewer = await openViewerAt(page, 20);
  const layer = viewer.getByTestId("region-layer");
  await drawRegion(page, layer, [0.04, 0.03], [0.48, 0.31]);
  await drawRegion(page, layer, [0.52, 0.03], [0.96, 0.31]);
  await expect(viewer.getByTestId("region-card")).toHaveCount(2);
  await viewer.getByLabel("Marcar viñeta 1").check();
  await viewer.getByLabel("Marcar viñeta 2").check();
  await viewer.getByTestId("insert-row").click();
  await closeViewer(page);
  await expect(viewer).toBeHidden();

  // Las dos viñetas quedan a la misma altura, una junto a otra (en la hoja 1 o en una nueva si no caben)
  const allImages = page.locator("[data-el-type=image]");
  await expect(allImages).toHaveCount(3);
  const [b1, b2] = await Promise.all([allImages.nth(1).boundingBox(), allImages.nth(2).boundingBox()]);
  expect(Math.abs(b1!.y - b2!.y)).toBeLessThan(2);
  expect(b2!.x).toBeGreaterThan(b1!.x + b1!.width - 1);

  // 11. Pregunta de comparación
  await page.getByTestId("left-tab-questions").click();
  await page.getByTestId("tpl-Respuesta corta").click();
  await page.getByTestId("prop-prompt").fill("Compara las dos escenas: ¿qué ha cambiado?");

  // 12-13. Segunda hoja con más preguntas
  await page.getByTestId("add-page").click();
  const lastPage = page.locator("[data-page-surface]").last();
  await page.getByTestId("tpl-Verdadero o falso").click();
  await expect(lastPage.locator("[data-el-type=question]")).toHaveCount(1);
  await page.getByTestId("left-tab-answers").click();
  await page.getByTestId("tpl-4 líneas").click();
  const pageCount = await page.locator("[data-page-surface]").count();
  expect(pageCount).toBeGreaterThanOrEqual(2);

  // 14. Guardado automático
  await expect(page.getByTestId("save-indicator")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
  const before = await page.locator("[data-el-id]").count();

  // Reabrir el proyecto: todo se conserva
  await page.reload();
  await expect(page.getByTestId("exam-page-1")).toBeVisible();
  await expect(page.locator("[data-el-id]")).toHaveCount(before);
  await expect(page.locator("[data-page-surface]")).toHaveCount(pageCount);
  await expect(page.locator("[data-el-type=image]")).toHaveCount(3);
  await expect(page.getByTestId("project-name")).toHaveValue("Comprensión lectora — Cómic");

  // 15. Vista previa de impresión
  await page.getByTestId("preview-link").click();
  await page.waitForURL(/vista-previa/);
  await expect(page.locator("iframe")).toBeVisible();
  await page.getByText("Vista rápida").click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".print-page")).toHaveCount(pageCount);
  await expect(frame.locator("body[data-print-ready=true]")).toBeAttached({ timeout: 30_000 });
  // La vista de impresión no contiene controles del editor
  await expect(frame.locator("[data-handle], button")).toHaveCount(0);
  await page.getByRole("link", { name: "Volver al editor" }).click();
  await page.waitForURL(/\/editor\/[^/]+$/);

  // 16. Exportar PDF: primero la revisión avisa de que la nota total (10) no coincide con la suma
  await page.getByTestId("export-pdf").click();
  const review = page.getByTestId("export-review");
  const totalIssue = review.locator("[data-kind=totalMismatch]");
  await expect(totalIssue).toBeVisible();
  await totalIssue.getByRole("button", { name: "Usar la suma" }).click();
  await expect(totalIssue).toHaveCount(0);
  await page.getByTestId("pdf-filename").fill("Examen comprensión 2.º ESO");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-pdf").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Examen comprensión 2.º ESO.pdf");
  const bytes = await fs.readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(pageCount);
  for (const p of pdf.getPages()) {
    expect(p.getWidth()).toBeCloseTo(595.3, 0);
    expect(p.getHeight()).toBeCloseTo(841.9, 0);
  }
  // Las viñetas se incrustan como imágenes a la resolución del ORIGINAL (≈ 42 % de 1000 px)
  const imageWidths: number[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict as PDFDict;
      if (dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) {
        const w = dict.get(PDFName.of("Width"));
        if (w instanceof PDFNumber) imageWidths.push(w.asNumber());
      }
    }
  }
  expect(imageWidths.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...imageWidths)).toBeGreaterThanOrEqual(400);

  // Las cuatro viñetas quedaron guardadas en la biblioteca (incluida la del aviso de borradores)
  const selections = await (await page.request.get("/api/selections")).json();
  expect(selections).toHaveLength(4);

  // 17. Borrar un cómic que se usa en un examen avisa de qué exámenes se verán afectados
  await page.goto("/biblioteca");
  const comicCard = page.getByTestId("comic-card").first();
  await comicCard.hover();
  await comicCard.getByRole("button", { name: "Acciones" }).click();
  await page.getByRole("menuitem", { name: "Eliminar" }).click();
  await expect(page.getByTestId("comic-usage-warning")).toContainText("Comprensión lectora — Cómic");
  await page.getByTestId("choice-dialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(comicCard).toBeVisible();
});
