import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION } from "@/lib/local/db";
import { safeFileName } from "@/lib/utils";

describe("coherencia entre la app y el service worker", () => {
  const sw = fs.readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
  it("usan la misma base de datos y almacenes", () => {
    expect(sw).toContain(`const DB_NAME = "${DB_NAME}"`);
    expect(sw).toContain(`const DB_VERSION = ${DB_VERSION}`);
    const dbTs = fs.readFileSync(path.resolve(__dirname, "../../src/lib/local/db.ts"), "utf8");
    const stores = (src: string) => [...src.matchAll(/createObjectStore\("(\w+)"/g)].map((m) => m[1]).sort();
    expect(stores(sw)).toEqual(stores(dbTs));
  });
  it("el binario de unrar está publicado", () => {
    expect(fs.statSync(path.resolve(__dirname, "../../public/unrar.wasm")).size).toBeGreaterThan(100_000);
  });
});

describe("nombre del PDF", () => {
  it("limpia caracteres no válidos", () => {
    expect(safeFileName("Examen: tema 1/2?")).toBe("Examen tema 1 2");
    expect(safeFileName("   ")).toBe("examen");
    expect(safeFileName("Comprensión lectora — 2.º ESO")).toBe("Comprensión lectora — 2.º ESO");
  });
});
