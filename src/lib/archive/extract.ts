import { Unzip, UnzipInflate, unzipSync } from "fflate";
import { createExtractorFromData } from "node-unrar-js/esm/index.esm.js";
import type { ArchiveKind } from "./detect";
import { naturalCompare } from "./natural-sort";
import { hasImageExtension, isIgnorableEntry, isSafeEntryName } from "./safe-path";

/**
 * Extracción segura de CBR (RAR) y CBZ (ZIP) en el navegador (también funciona en Node para las pruebas).
 * - Nunca se usan los nombres de las entradas como rutas: solo sirven para ordenar y mostrar.
 * - Se validan número de entradas, tamaños declarados y reales y tasa de compresión ANTES de descomprimir.
 * - Se descomprime una imagen cada vez para limitar la memoria.
 */

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

export interface ExtractLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxCompressionRatio: number;
}

export interface PlannedEntry {
  /** Nombre dentro del archivo (solo para ordenar y mostrar). */
  name: string;
  size: number;
  /** Posición final de la página tras la ordenación natural (0..n-1). */
  index: number;
}

export interface ExtractCallbacks {
  onPlan?: (entries: PlannedEntry[]) => void | Promise<void>;
  /** Se llama por cada imagen extraída (en orden de archivo, no de página). */
  onEntry: (entry: PlannedEntry, data: Uint8Array) => Promise<void>;
}

interface RawEntry {
  name: string;
  size: number;
  encrypted: boolean;
  directory: boolean;
}

/** Selecciona, valida y ordena las entradas de imagen. Lanza ArchiveError si se superan límites. */
export function planEntries(raw: RawEntry[], archiveBytes: number, limits: ExtractLimits): PlannedEntry[] {
  if (raw.length > limits.maxEntries) {
    throw new ArchiveError(`El archivo contiene demasiadas entradas (${raw.length}). Máximo permitido: ${limits.maxEntries}.`);
  }
  const candidates = raw.filter((e) => !e.directory && !isIgnorableEntry(e.name) && hasImageExtension(e.name));
  for (const e of candidates) {
    if (!isSafeEntryName(e.name)) {
      throw new ArchiveError(`El archivo contiene una ruta no válida o peligrosa: "${e.name.slice(0, 120)}".`);
    }
    if (e.encrypted) {
      throw new ArchiveError("El archivo está protegido con contraseña. Descomprímelo y vuelve a comprimirlo sin contraseña.");
    }
    if (e.size > limits.maxEntryBytes) {
      throw new ArchiveError(
        `La imagen "${e.name}" ocupa ${(e.size / 1048576).toFixed(0)} MB descomprimida, más del máximo permitido (${(limits.maxEntryBytes / 1048576).toFixed(0)} MB).`,
      );
    }
  }
  const total = candidates.reduce((s, e) => s + e.size, 0);
  if (total > limits.maxTotalBytes) throw new ArchiveError("El contenido descomprimido supera el tamaño máximo permitido.");
  if (archiveBytes > 0 && total / archiveBytes > limits.maxCompressionRatio) {
    throw new ArchiveError("El archivo tiene una tasa de compresión anómala (posible bomba de descompresión) y se ha rechazado.");
  }
  if (candidates.length === 0) throw new ArchiveError("No se han encontrado imágenes (JPG, PNG, WebP…) dentro del archivo.");
  const seen = new Set<string>();
  const unique = candidates.filter((e) => !seen.has(e.name) && seen.add(e.name));
  return [...unique].sort((a, b) => naturalCompare(a.name, b.name)).map((e, index) => ({ name: e.name, size: e.size, index }));
}

function unrarMessage(err: unknown): string {
  const reason = (err as { reason?: string })?.reason;
  switch (reason) {
    case "ERAR_MISSING_PASSWORD":
    case "ERAR_BAD_PASSWORD":
      return "El archivo RAR está protegido con contraseña.";
    case "ERAR_BAD_ARCHIVE":
    case "ERAR_UNKNOWN_FORMAT":
      return "El archivo RAR está dañado o no tiene un formato válido.";
    case "ERAR_BAD_DATA":
      return "El archivo RAR contiene datos corruptos (error de comprobación).";
    case "ERAR_EREFERENCE":
      return "El archivo RAR depende de otro volumen que no está disponible.";
    case "ERAR_NO_MEMORY":
      return "No hay memoria suficiente para descomprimir el archivo. Prueba a cerrar otras pestañas.";
    default:
      return "No se ha podido leer el archivo RAR. Puede que esté dañado.";
  }
}

async function extractRar(data: ArrayBuffer, wasmBinary: ArrayBuffer | undefined, limits: ExtractLimits, cb: ExtractCallbacks): Promise<number> {
  let plan: PlannedEntry[];
  try {
    const list = (await createExtractorFromData({ data, wasmBinary })).getFileList();
    if (list.arcHeader.flags.volume) {
      throw new ArchiveError("Los archivos RAR divididos en varios volúmenes no están soportados. Únelos en un solo archivo.");
    }
    const raw: RawEntry[] = [...list.fileHeaders].map((h) => ({
      name: h.name,
      size: h.unpSize,
      encrypted: h.flags.encrypted,
      directory: h.flags.directory,
    }));
    plan = planEntries(raw, data.byteLength, limits);
  } catch (err) {
    if (err instanceof ArchiveError) throw err;
    throw new ArchiveError(unrarMessage(err));
  }
  await cb.onPlan?.(plan);
  const byName = new Map(plan.map((p) => [p.name, p]));
  let count = 0;
  try {
    const { files } = (await createExtractorFromData({ data, wasmBinary })).extract({ files: (h) => byName.has(h.name) && !h.flags.directory });
    // El generador descomprime de forma perezosa: una imagen en memoria cada vez.
    for (const file of files) {
      const entry = byName.get(file.fileHeader.name);
      if (!entry || !file.extraction) continue;
      byName.delete(file.fileHeader.name);
      if (file.extraction.byteLength !== entry.size || file.extraction.byteLength > limits.maxEntryBytes) {
        throw new ArchiveError(`Tamaño inesperado al extraer "${entry.name}". El archivo podría estar manipulado.`);
      }
      await cb.onEntry(entry, file.extraction);
      count++;
    }
  } catch (err) {
    if (err instanceof ArchiveError) throw err;
    throw new ArchiveError(unrarMessage(err));
  }
  return count;
}

async function extractZip(data: ArrayBuffer, limits: ExtractLimits, cb: ExtractCallbacks): Promise<number> {
  const bytes = new Uint8Array(data);
  // 1) Índice (directorio central) sin descomprimir nada.
  const raw: RawEntry[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        raw.push({ name: f.name, size: f.originalSize, encrypted: false, directory: f.name.endsWith("/") });
        return false;
      },
    });
  } catch {
    throw new ArchiveError("El archivo ZIP/CBZ está dañado o no tiene un formato válido.");
  }
  const plan = planEntries(raw, bytes.byteLength, limits);
  await cb.onPlan?.(plan);
  const byName = new Map(plan.map((p) => [p.name, p]));

  // 2) Descompresión por fragmentos: cada imagen se procesa en cuanto se completa.
  const ready: { entry: PlannedEntry; data: Uint8Array }[] = [];
  let failure: Error | null = null;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    const entry = byName.get(file.name);
    if (!entry) return;
    byName.delete(file.name);
    const chunks: Uint8Array[] = [];
    let total = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = new ArchiveError(`No se ha podido descomprimir "${entry.name}": el archivo podría estar dañado o protegido con contraseña.`);
        return;
      }
      total += chunk.length;
      if (total > Math.min(limits.maxEntryBytes, entry.size)) {
        failure = new ArchiveError(`Tamaño inesperado al extraer "${entry.name}". El archivo podría estar manipulado.`);
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.length;
        }
        ready.push({ entry, data: out });
      }
    };
    file.start();
  };
  const CHUNK = 1 << 20;
  let count = 0;
  for (let off = 0; off < bytes.length; off += CHUNK) {
    try {
      unzip.push(bytes.subarray(off, off + CHUNK), off + CHUNK >= bytes.length);
    } catch {
      failure ??= new ArchiveError("El archivo ZIP/CBZ está dañado.");
    }
    if (failure) throw failure;
    while (ready.length) {
      const item = ready.shift()!;
      await cb.onEntry(item.entry, item.data);
      count++;
    }
  }
  if (failure) throw failure;
  return count;
}

/** Extrae las imágenes de un CBR/CBZ ya cargado en memoria. `wasmBinary`: binario de unrar (solo RAR). */
export async function extractArchiveImages(
  data: ArrayBuffer,
  kind: ArchiveKind,
  limits: ExtractLimits,
  cb: ExtractCallbacks,
  wasmBinary?: ArrayBuffer,
): Promise<number> {
  return kind === "rar" ? extractRar(data, wasmBinary, limits, cb) : extractZip(data, limits, cb);
}
