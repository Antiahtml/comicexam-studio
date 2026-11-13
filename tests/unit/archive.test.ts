import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import sharp from "sharp";
import { ArchiveError, extractArchiveImages, planEntries, type ExtractLimits } from "@/lib/archive/extract";
import { createRar5Store } from "../helpers/rar5-writer";

const limits: ExtractLimits = { maxEntries: 100, maxEntryBytes: 10 * 1048576, maxTotalBytes: 50 * 1048576, maxCompressionRatio: 50 };
let tmp: string;
const png = (n: number) => sharp({ create: { width: 20 + n, height: 30, channels: 3, background: "#f59e0b" } }).png().toBuffer();

async function collect(file: string, kind: "rar" | "zip", l = limits) {
  const out: { index: number; name: string; size: number; width: number }[] = [];
  await extractArchiveImages(file, kind, l, {
    onEntry: async (entry, data) => {
      const meta = await sharp(data).metadata();
      out.push({ index: entry.index, name: entry.name, size: data.length, width: meta.width! });
    },
  });
  return out.sort((a, b) => a.index - b.index);
}

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "comicexam-archive-"));
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("importación de CBR (RAR5) y CBZ", () => {
  it("extrae un CBR y ordena las páginas de forma natural", async () => {
    const entries = [];
    for (const n of [10, 2, 1, 11, 3]) entries.push({ name: `comic/p${n}.png`, data: await png(n) });
    entries.push({ name: "comic/ComicInfo.xml", data: Buffer.from("<x/>") });
    entries.push({ name: "__MACOSX/comic/._p1.png", data: Buffer.from("x") });
    const file = path.join(tmp, "a.cbr");
    await fs.writeFile(file, createRar5Store(entries));
    const pages = await collect(file, "rar");
    expect(pages.map((p) => p.name)).toEqual(["comic/p1.png", "comic/p2.png", "comic/p3.png", "comic/p10.png", "comic/p11.png"]);
    // El contenido corresponde a cada entrada (ancho = 20 + n)
    expect(pages.map((p) => p.width)).toEqual([21, 22, 23, 30, 31]);
  });

  it("extrae un CBZ con la misma ordenación", async () => {
    const files: Record<string, Uint8Array> = {};
    for (const n of [9, 10, 8]) files[`Cap 1/${n}.png`] = new Uint8Array(await png(n));
    const file = path.join(tmp, "a.cbz");
    await fs.writeFile(file, zipSync(files));
    const pages = await collect(file, "zip");
    expect(pages.map((p) => p.name)).toEqual(["Cap 1/8.png", "Cap 1/9.png", "Cap 1/10.png"]);
  });

  it("procesa el cómic de ejemplo de 48 páginas", async () => {
    const fixture = path.resolve(__dirname, "../../fixtures/demo-comic.cbr");
    const pages = await collect(fixture, "rar");
    expect(pages).toHaveLength(48);
    expect(pages[11].name).toMatch(/pagina 12\.jpg$/);
  });

  it("rechaza rutas peligrosas (path traversal)", async () => {
    const file = path.join(tmp, "evil.cbr");
    await fs.writeFile(file, createRar5Store([{ name: "../../evil.png", data: await png(1) }]));
    await expect(collect(file, "rar")).rejects.toThrow(/ruta no válida/);
    const zfile = path.join(tmp, "evil.cbz");
    await fs.writeFile(zfile, zipSync({ "ok/../../../evil.png": new Uint8Array(await png(1)) }));
    await expect(collect(zfile, "zip")).rejects.toThrow(ArchiveError);
  });

  it("rechaza bombas de descompresión por tasa de compresión", async () => {
    const zeros = new Uint8Array(20 * 1048576); // 20 MB de ceros → se comprimen a ~20 KB
    const file = path.join(tmp, "bomb.cbz");
    await fs.writeFile(file, zipSync({ "p1.jpg": zeros }, { level: 9 }));
    // Con límites de tamaño holgados, la tasa de compresión anómala detiene la importación…
    await expect(collect(file, "zip", { ...limits, maxEntryBytes: 100 * 1048576 })).rejects.toThrow(/compresión anómala/);
    // …y con los límites normales lo hace el tamaño máximo por imagen.
    await expect(collect(file, "zip")).rejects.toThrow(/máximo permitido/);
  });

  it("aplica los límites de número de entradas y tamaño", () => {
    const raw = Array.from({ length: 5 }, (_, i) => ({ name: `${i}.jpg`, size: 10, compressed: 10, encrypted: false, directory: false }));
    expect(() => planEntries(raw, 100, { ...limits, maxEntries: 3 })).toThrow(/demasiadas entradas/);
    expect(() => planEntries([{ ...raw[0], size: 11 * 1048576 }], 11 * 1048576, limits)).toThrow(/máximo permitido/);
    expect(() => planEntries([{ ...raw[0], encrypted: true }], 100, limits)).toThrow(/contraseña/);
    expect(() => planEntries([{ name: "a.txt", size: 1, compressed: 1, encrypted: false, directory: false }], 100, limits)).toThrow(/No se han encontrado imágenes/);
  });

  it("detecta archivos RAR dañados", async () => {
    const good = createRar5Store([{ name: "p1.png", data: await png(1) }]);
    const bad = Buffer.from(good);
    bad[bad.length - 40] ^= 0xff; // corrompe los datos
    const file = path.join(tmp, "bad.cbr");
    await fs.writeFile(file, bad);
    await expect(collect(file, "rar")).rejects.toThrow(ArchiveError);
  });
});
