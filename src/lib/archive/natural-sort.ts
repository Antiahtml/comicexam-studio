/**
 * Ordenación "natural" de nombres de archivo: "pag2.jpg" < "pag10.jpg".
 * Compara por segmentos de directorio y, dentro de cada segmento, por trozos
 * numéricos y de texto. Ignora mayúsculas y acentos.
 */
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function splitPath(name: string): string[] {
  return name.replace(/\\/g, "/").split("/").filter(Boolean);
}

export function naturalCompare(a: string, b: string): number {
  const pa = splitPath(a);
  const pb = splitPath(b);
  // Los archivos de directorios menos profundos van antes que los de subcarpetas
  // solo si comparten prefijo; en general se compara segmento a segmento.
  const len = Math.min(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const isLastA = i === pa.length - 1;
    const isLastB = i === pb.length - 1;
    if (isLastA !== isLastB) {
      // Un archivo suelto va antes que una subcarpeta del mismo nivel.
      return isLastA ? -1 : 1;
    }
    const c = collator.compare(pa[i], pb[i]);
    if (c !== 0) return c;
  }
  return pa.length - pb.length;
}

export function naturalSort<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(key(a), key(b)));
}
