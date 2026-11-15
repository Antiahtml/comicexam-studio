/** Subcarpeta de publicación (GitHub Pages). Vacía en desarrollo local. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Ruta absoluta dentro de la aplicación, con la subcarpeta de publicación. */
export const withBase = (path: string) => `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;

/** Límites de importación (protección contra archivos enormes o maliciosos). */
export const LIMITS = {
  maxUploadBytes: 1024 * 1024 * 1024,
  maxEntryBytes: 120 * 1024 * 1024,
  maxTotalBytes: 4096 * 1024 * 1024,
  maxEntries: 3000,
  maxImagePixels: 150_000_000,
  maxCompressionRatio: 50,
  maxImageUploadBytes: 60 * 1024 * 1024,
};

export const IMAGE_SIZES = { thumbWidth: 320, previewWidth: 1800 };
