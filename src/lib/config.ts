import path from "node:path";

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MB = 1024 * 1024;

/** Configuración del servidor. Todos los límites se pueden ajustar con variables de entorno. */
export const config = {
  dataDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || "./data.nosync"),
  limits: {
    maxUploadBytes: numEnv("MAX_UPLOAD_MB", 1024) * MB,
    maxEntryBytes: numEnv("MAX_ENTRY_MB", 120) * MB,
    maxTotalUncompressedBytes: numEnv("MAX_TOTAL_UNCOMPRESSED_MB", 4096) * MB,
    maxEntries: numEnv("MAX_ARCHIVE_ENTRIES", 3000),
    maxImagePixels: numEnv("MAX_IMAGE_MEGAPIXELS", 150) * 1_000_000,
    /** Relación máxima tamaño descomprimido / comprimido aceptada (anti bombas de descompresión). */
    maxCompressionRatio: numEnv("MAX_COMPRESSION_RATIO", 50),
    maxImageUploadBytes: numEnv("MAX_IMAGE_UPLOAD_MB", 60) * MB,
  },
  images: {
    thumbWidth: 320,
    previewWidth: 1800,
  },
};

export type AppConfig = typeof config;
