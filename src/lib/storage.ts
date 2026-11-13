import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config";

/**
 * Resuelve una ruta relativa dentro de DATA_DIR y garantiza que no se sale de ella.
 * Las rutas que se guardan en base de datos se generan siempre en el servidor
 * (nunca a partir de nombres de archivos importados), pero se valida igualmente.
 */
export function dataPath(relative: string): string {
  const base = config.dataDir;
  const resolved = path.resolve(base, relative);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("Ruta fuera del directorio de datos");
  }
  return resolved;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Directorio temporal aislado para una operación. Se elimina con `cleanup`. */
export async function createTempWorkspace(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = dataPath(path.join("tmp", `${prefix}-${randomUUID()}`));
  await ensureDir(dir);
  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

export function comicDir(comicId: string): string {
  if (!/^[a-z0-9]+$/i.test(comicId)) throw new Error("Identificador de cómic no válido");
  return path.join("comics", comicId);
}

export async function removeComicFiles(comicId: string): Promise<void> {
  await fs.rm(dataPath(comicDir(comicId)), { recursive: true, force: true });
}
