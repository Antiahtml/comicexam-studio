import { displayName } from "../archive/safe-path";

/**
 * Título legible a partir del nombre de archivo:
 * "Mi.comic.favorito.-.Ana.Autora.[GrupoX][ES].cbr" → "Mi comic favorito - Ana Autora".
 */
export function titleFromFileName(name: string): string {
  let t = displayName(name).replace(/\.(cbr|cbz|rar|zip|jpe?g|png|webp)$/i, "");
  t = t.replace(/\[[^\]]*\]|\{[^}]*\}/g, " "); // etiquetas de grupos: [CRG], {scan}
  if (!/\s/.test(t) || /[._]/.test(t)) t = t.replace(/[._]+/g, " "); // puntos o guiones bajos como separadores
  t = t.replace(/\s+/g, " ").replace(/^[\s\-–—]+|[\s\-–—]+$/g, "").trim();
  return t.slice(0, 160) || "Còmic sense títol";
}
