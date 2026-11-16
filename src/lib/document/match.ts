/**
 * «Relacionar conceptes»: el docent escribe cada parella correcta (columna A ↔ columna B) y el
 * programa barreja la columna B en pantalla i en el PDF. La barreja és determinista (depèn d'una
 * llavor guardada amb l'examen), de manera que no canvia en reobrir-lo ni en imprimir.
 */

/** Generador pseudoaleatori petit i estable (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Llavor nova (enter positiu de 31 bits). */
export function newShuffleSeed(): number {
  return 1 + Math.floor(Math.random() * 2147483646);
}

/**
 * Ordre en què es mostren les files de la columna B: `order[pos]` és l'índex de la parella que va
 * a la posició `pos`. Sense llavor (0) o amb menys de 2 parelles es manté l'ordre original.
 * Amb llavor, cap parella queda a la seva pròpia fila (així la solució no és evident).
 */
export function matchOrder(n: number, seed: number | undefined): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (!seed || n < 2) return order;
  const rnd = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < n; i++) {
    if (order[i] === i) {
      const j = (i + 1) % n;
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  return order;
}

/** Solució: per a cada concepte de la columna A, la posició (0 = a) que té la seva parella a la columna B. */
export function matchSolution(n: number, seed: number | undefined): number[] {
  const order = matchOrder(n, seed);
  const sol = new Array<number>(n).fill(0);
  order.forEach((pairIndex, pos) => {
    sol[pairIndex] = pos;
  });
  return sol;
}
