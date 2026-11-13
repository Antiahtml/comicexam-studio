/**
 * Validación de nombres de entradas de archivos comprimidos.
 *
 * IMPORTANTE: la aplicación nunca escribe en disco usando el nombre de la entrada
 * (las páginas se guardan como `pages/0001.jpg`, etc.), por lo que Zip Slip no es
 * posible por diseño. Aun así, se rechazan nombres sospechosos como defensa en profundidad
 * y para no mostrar entradas manipuladas al usuario.
 */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.length > 1024) return false;
  if (name.includes("\0")) return false;
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return false; // ruta absoluta
  if (/^[a-zA-Z]:/.test(normalized)) return false; // unidad de Windows
  const parts = normalized.split("/");
  if (parts.some((p) => p === "..")) return false; // path traversal
  if (/[\x00-\x1f]/.test(normalized)) return false;
  return true;
}

/** Entradas que se ignoran: metadatos de macOS, archivos ocultos, miniaturas de Windows… */
export function isIgnorableEntry(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const base = parts[parts.length - 1] ?? "";
  if (parts.some((p) => p === "__MACOSX")) return true;
  if (base.startsWith(".")) return true;
  if (/^thumbs\.db$/i.test(base) || /^desktop\.ini$/i.test(base)) return true;
  return false;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)$/i;

export function hasImageExtension(name: string): boolean {
  return IMAGE_EXT.test(name);
}

/** Nombre "bonito" para mostrar: último segmento de la ruta. */
export function displayName(name: string): string {
  const parts = name.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || name;
}
