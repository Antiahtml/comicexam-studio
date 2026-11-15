import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import sharp from "sharp";
import { ArchiveError, extractArchiveImages, planEntries, type ExtractLimits } from "@/lib/archive/extract";
import { titleFromFileName } from "@/lib/local/titles";
import { createRar5Store } from "../helpers/rar5-writer";

const limits: ExtractLimits = { maxEntries: 100, maxEntryBytes: 10 * 1048576, maxTotalBytes: 50 * 1048576, maxCompressionRatio: 50 };
const png = (n: number) => sharp({ create: { width: 20 + n, height: 30, channels: 3, background: "#f59e0b" } }).png().toBuffer();
const ab = (b: Uint8Array | Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
let wasm: ArrayBuffer;

beforeAll(async () => {
  wasm = ab(await fs.readFile(path.resolve(__dirname, "../../public/unrar.wasm")));
});

async function collect(data: Uint8Array | Buffer, kind: "rar" | "zip", l = limits) {
  const out: { index: number; name: string; size: number; width: number }[] = [];
  await extractArchiveImages(
    ab(data),
    kind,
    l,
    {
      onEntry: async (entry, bytes) => {
        const meta = await sharp(Buffer.from(bytes)).metadata();
        out.push({ index: entry.index, name: entry.name, size: bytes.length, width: meta.width! });
      },
    },
    wasm,
  );
  return out.sort((a, b) => a.index - b.index);
}

describe("importación de CBR (RAR5) y CBZ en el navegador", () => {
  it("extrae un CBR y ordena las páginas de forma natural", async () => {
    const entries = [];
    for (const n of [10, 2, 1, 11, 3]) entries.push({ name: `comic/p${n}.png`, data: await png(n) });
    entries.push({ name: "comic/ComicInfo.xml", data: Buffer.from("<x/>") });
    entries.push({ name: "__MACOSX/comic/._p1.png", data: Buffer.from("x") });
    const pages = await collect(createRar5Store(entries), "rar");
    expect(pages.map((p) => p.name)).toEqual(["comic/p1.png", "comic/p2.png", "comic/p3.png", "comic/p10.png", "comic/p11.png"]);
    // El contenido corresponde a cada entrada (ancho = 20 + n)
    expect(pages.map((p) => p.width)).toEqual([21, 22, 23, 30, 31]);
  });

  it("extrae un CBZ comprimido por fragmentos con la misma ordenación", async () => {
    const files: Record<string, Uint8Array> = {};
    for (const n of [9, 10, 8]) files[`Cap 1/${n}.png`] = new Uint8Array(await png(n));
    const pages = await collect(zipSync(files, { level: 6 }), "zip");
    expect(pages.map((p) => p.name)).toEqual(["Cap 1/8.png", "Cap 1/9.png", "Cap 1/10.png"]);
  });

  it("procesa el cómic de ejemplo de 48 páginas (CBR y CBZ)", async () => {
    for (const [file, kind] of [
      ["demo-comic.cbr", "rar"],
      ["demo-comic.cbz", "zip"],
    ] as const) {
      const pages = await collect(await fs.readFile(path.resolve(__dirname, "../../fixtures", file)), kind);
      expect(pages).toHaveLength(48);
      expect(pages[11].name).toMatch(/pagina 12\.jpg$/);
    }
  });

  it("rechaza rutas peligrosas (path traversal)", async () => {
    await expect(collect(createRar5Store([{ name: "../../evil.png", data: await png(1) }]), "rar")).rejects.toThrow(/ruta no válida/);
    await expect(collect(zipSync({ "ok/../../../evil.png": new Uint8Array(await png(1)) }), "zip")).rejects.toThrow(ArchiveError);
  });

  it("rechaza bombas de descompresión", async () => {
    const bomb = zipSync({ "p1.jpg": new Uint8Array(20 * 1048576) }, { level: 9 }); // 20 MB de ceros
    await expect(collect(bomb, "zip", { ...limits, maxEntryBytes: 100 * 1048576 })).rejects.toThrow(/compresión anómala/);
    await expect(collect(bomb, "zip")).rejects.toThrow(/máximo permitido/);
  });

  it("aplica los límites de número de entradas y tamaño", () => {
    const raw = Array.from({ length: 5 }, (_, i) => ({ name: `${i}.jpg`, size: 10, encrypted: false, directory: false }));
    expect(() => planEntries(raw, 100, { ...limits, maxEntries: 3 })).toThrow(/demasiadas entradas/);
    expect(() => planEntries([{ ...raw[0], size: 11 * 1048576 }], 11 * 1048576, limits)).toThrow(/máximo permitido/);
    expect(() => planEntries([{ ...raw[0], encrypted: true }], 100, limits)).toThrow(/contraseña/);
    expect(() => planEntries([{ name: "a.txt", size: 1, encrypted: false, directory: false }], 100, limits)).toThrow(/No se han encontrado imágenes/);
  });

  it("detecta archivos RAR dañados y ZIP no válidos", async () => {
    const bad = Buffer.from(createRar5Store([{ name: "p1.png", data: await png(1) }]));
    bad[bad.length - 40] ^= 0xff;
    await expect(collect(bad, "rar")).rejects.toThrow(ArchiveError);
    await expect(collect(Buffer.from("PK\x03\x04 no es un zip"), "zip")).rejects.toThrow(ArchiveError);
  });
});

describe("títulos legibles", () => {
  it.each([
    ["Mi.comic.favorito.-.Ana.Autora.[GrupoX][ES].cbr", "Mi comic favorito - Ana Autora"],
    ["Las_aventuras_de_Lia_01.cbz", "Las aventuras de Lia 01"],
    ["Astérix y Obélix (1959).cbr", "Astérix y Obélix (1959)"],
    ["[Grupo] .cbr", "Cómic sin título"],
  ])("%s → %s", (input, expected) => {
    expect(titleFromFileName(input)).toBe(expected);
  });
});
