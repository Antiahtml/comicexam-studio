/**
 * Genera cómics de prueba (de uso libre, creados desde cero) en fixtures/:
 *   - demo-comic.cbr  → RAR 5 real, 48 páginas
 *   - demo-comic.cbz  → ZIP, 48 páginas
 * Los nombres de archivo están pensados para comprobar la ordenación natural
 * ("pagina 2" antes que "pagina 10") e incluyen entradas que deben ignorarse.
 *
 * Uso:  npm run fixtures
 */
import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import { createRar5Store, type RarEntry } from "../tests/helpers/rar5-writer";
import { renderComicPage } from "../tests/helpers/comic-pages";

const OUT = path.resolve(process.cwd(), "fixtures");
const TOTAL = Number(process.env.PAGES || 48);

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const entries: RarEntry[] = [];
  for (let p = 1; p <= TOTAL; p++) {
    entries.push({ name: `Las aventuras de Lia/pagina ${p}.jpg`, data: await renderComicPage(p, TOTAL) });
    process.stdout.write(`\rGenerando páginas… ${p}/${TOTAL}`);
  }
  process.stdout.write("\n");
  // Entradas que la importación debe ignorar
  const extras: RarEntry[] = [
    { name: "Las aventuras de Lia/ComicInfo.xml", data: Buffer.from(`<?xml version="1.0"?><ComicInfo><Title>Las aventuras de Lía</Title></ComicInfo>`) },
    { name: "__MACOSX/Las aventuras de Lia/._pagina 1.jpg", data: Buffer.from("basura de macOS") },
  ];
  // Se mezcla el orden de las entradas dentro del archivo para comprobar la ordenación.
  const shuffled = [...entries].sort((a, b) => (a.name.length % 3) - (b.name.length % 3) || b.name.localeCompare(a.name));
  const all = [...shuffled, ...extras];

  const rar = createRar5Store(all);
  await fs.writeFile(path.join(OUT, "demo-comic.cbr"), rar);

  const zipInput: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const e of all) zipInput[e.name] = [new Uint8Array(e.data), { level: 0 }];
  await fs.writeFile(path.join(OUT, "demo-comic.cbz"), zipSync(zipInput));

  console.log(`✔ fixtures/demo-comic.cbr (${(rar.length / 1048576).toFixed(1)} MB, RAR5)`);
  console.log(`✔ fixtures/demo-comic.cbz`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
