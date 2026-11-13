import fs from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import { createExtractorFromData } from "node-unrar-js";
import type { ArchiveKind } from "./detect";
import { naturalCompare } from "./natural-sort";
import { hasImageExtension, isIgnorableEntry, isSafeEntryName } from "./safe-path";

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
  /** Se llama una vez con el plan de páginas ya ordenado. */
  onPlan?: (entries: PlannedEntry[]) => void | Promise<void>;
  /** Se llama por cada imagen extraída (en orden de archivo, no de página). */
  onEntry: (entry: PlannedEntry, data: Buffer) => Promise<void>;
}

interface RawEntry {
  name: string;
  size: number;
  compressed: number;
  encrypted: boolean;
  directory: boolean;
}

/** Selecciona, valida y ordena las entradas de imagen. Lanza ArchiveError si se superan límites. */
export function planEntries(raw: RawEntry[], archiveBytes: number, limits: ExtractLimits): PlannedEntry[] {
  if (raw.length > limits.maxEntries) {
    throw new ArchiveError(`El archivo contiene demasiadas entradas (${raw.length}). Máximo permitido: ${limits.maxEntries}.`);
  }
  const files = raw.filter((e) => !e.directory);
  const candidates = files.filter((e) => !isIgnorableEntry(e.name) && hasImageExtension(e.name));
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
  if (total > limits.maxTotalBytes) {
    throw new ArchiveError("El contenido descomprimido supera el tamaño máximo permitido.");
  }
  if (archiveBytes > 0 && total / archiveBytes > limits.maxCompressionRatio) {
    throw new ArchiveError("El archivo tiene una tasa de compresión anómala (posible bomba de descompresión) y se ha rechazado.");
  }
  if (candidates.length === 0) {
    throw new ArchiveError("No se han encontrado imágenes (JPG, PNG, WebP…) dentro del archivo.");
  }
  const sorted = [...candidates].sort((a, b) => naturalCompare(a.name, b.name));
  return sorted.map((e, index) => ({ name: e.name, size: e.size, index }));
}

let wasmCache: ArrayBuffer | undefined;
async function loadUnrarWasm(): Promise<ArrayBuffer | undefined> {
  if (wasmCache) return wasmCache;
  const candidates = [path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "node-unrar-js", "dist", "js", "unrar.wasm")];
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p);
      wasmCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return wasmCache;
    } catch {
      /* se deja que la librería lo localice */
    }
  }
  return undefined;
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
      return "El archivo RAR contiene datos corruptos (error de CRC).";
    case "ERAR_EREFERENCE":
      return "El archivo RAR depende de otro volumen o referencia que no está disponible.";
    case "ERAR_NO_MEMORY":
      return "No hay memoria suficiente para descomprimir el archivo.";
    default:
      return `No se ha podido leer el archivo RAR${err instanceof Error ? `: ${err.message}` : "."}`;
  }
}

async function extractRar(filePath: string, limits: ExtractLimits, cb: ExtractCallbacks): Promise<number> {
  const fileBuf = await fs.readFile(filePath);
  const data = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength) as ArrayBuffer;
  const wasmBinary = await loadUnrarWasm();
  let plan: PlannedEntry[];
  try {
    const listExtractor = await createExtractorFromData({ data, wasmBinary });
    const list = listExtractor.getFileList();
    if (list.arcHeader.flags.volume) {
      throw new ArchiveError("Los archivos RAR divididos en varios volúmenes no están soportados. Únelos en un solo archivo.");
    }
    const raw: RawEntry[] = [...list.fileHeaders].map((h) => ({
      name: h.name,
      size: h.unpSize,
      compressed: h.packSize,
      encrypted: h.flags.encrypted,
      directory: h.flags.directory,
    }));
    plan = planEntries(raw, fileBuf.byteLength, limits);
  } catch (err) {
    if (err instanceof ArchiveError) throw err;
    throw new ArchiveError(unrarMessage(err));
  }
  await cb.onPlan?.(plan);
  const byName = new Map(plan.map((p) => [p.name, p]));
  const extractor = await createExtractorFromData({ data, wasmBinary });
  let count = 0;
  try {
    const { files } = extractor.extract({ files: (h) => byName.has(h.name) && !h.flags.directory });
    // El generador descomprime de forma perezosa: una imagen en memoria cada vez.
    for (const file of files) {
      const entry = byName.get(file.fileHeader.name);
      if (!entry || !file.extraction) continue;
      if (file.extraction.byteLength > limits.maxEntryBytes || file.extraction.byteLength !== entry.size) {
        throw new ArchiveError(`Tamaño inesperado al extraer "${entry.name}". El archivo podría estar manipulado.`);
      }
      await cb.onEntry(entry, Buffer.from(file.extraction.buffer, file.extraction.byteOffset, file.extraction.byteLength));
      count++;
    }
  } catch (err) {
    if (err instanceof ArchiveError) throw err;
    throw new ArchiveError(unrarMessage(err));
  }
  return count;
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, strictFileNames: false, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error("zip"));
      else resolve(zip);
    });
  });
}

function readZipEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on("entry", (e: yauzl.Entry) => {
      entries.push(e);
      zip.readEntry();
    });
    zip.on("end", () => resolve(entries));
    zip.on("error", reject);
    zip.readEntry();
  });
}

function readEntryData(zip: yauzl.ZipFile, entry: yauzl.Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("stream"));
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          stream.destroy(new ArchiveError("Una entrada supera el tamaño máximo permitido al descomprimir."));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

async function extractZip(filePath: string, limits: ExtractLimits, cb: ExtractCallbacks): Promise<number> {
  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(filePath);
  } catch {
    throw new ArchiveError("El archivo ZIP/CBZ está dañado o no tiene un formato válido.");
  }
  try {
    const stat = await fs.stat(filePath);
    let entries: yauzl.Entry[];
    try {
      entries = await readZipEntries(zip);
    } catch {
      throw new ArchiveError("No se ha podido leer el índice del archivo ZIP/CBZ.");
    }
    const raw: RawEntry[] = entries.map((e) => ({
      name: e.fileName,
      size: e.uncompressedSize,
      compressed: e.compressedSize,
      encrypted: (e.generalPurposeBitFlag & 0x1) !== 0,
      directory: e.fileName.endsWith("/"),
    }));
    const plan = planEntries(raw, stat.size, limits);
    await cb.onPlan?.(plan);
    const byName = new Map(plan.map((p) => [p.name, p]));
    let count = 0;
    for (const e of entries) {
      const entry = byName.get(e.fileName);
      if (!entry) continue;
      byName.delete(e.fileName); // nombres duplicados: solo la primera aparición
      let data: Buffer;
      try {
        data = await readEntryData(zip, e, Math.min(limits.maxEntryBytes, entry.size));
      } catch (err) {
        if (err instanceof ArchiveError) throw err;
        throw new ArchiveError(`No se ha podido descomprimir "${entry.name}": el archivo podría estar dañado.`);
      }
      await cb.onEntry(entry, data);
      count++;
    }
    return count;
  } finally {
    zip.close();
  }
}

/**
 * Extrae las imágenes de un archivo CBR/CBZ de forma segura:
 * - sin usar nunca el nombre de las entradas como ruta en disco,
 * - sin invocar procesos externos ni shell,
 * - validando número de entradas, tamaños declarados y reales y tasa de compresión.
 */
export async function extractArchiveImages(
  filePath: string,
  kind: ArchiveKind,
  limits: ExtractLimits,
  cb: ExtractCallbacks,
): Promise<number> {
  return kind === "rar" ? extractRar(filePath, limits, cb) : extractZip(filePath, limits, cb);
}
