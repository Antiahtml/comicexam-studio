import type { FontId } from "./types";

/** Fuentes disponibles. Todas se sirven localmente (paquetes @fontsource), sin servicios externos. */
export const FONTS: Record<FontId, { label: string; css: string; group: "Sans" | "Serif" | "Cómic" | "Accesible" | "Sistema" }> = {
  inter: { label: "Inter", css: "'Inter Variable', Inter, system-ui, sans-serif", group: "Sans" },
  atkinson: { label: "Atkinson Hyperlegible", css: "'Atkinson Hyperlegible', system-ui, sans-serif", group: "Accesible" },
  openDyslexic: { label: "OpenDyslexic", css: "'OpenDyslexic', 'Comic Sans MS', sans-serif", group: "Accesible" },
  merriweather: { label: "Merriweather", css: "'Merriweather Variable', Merriweather, Georgia, serif", group: "Serif" },
  lora: { label: "Lora", css: "'Lora Variable', Lora, Georgia, serif", group: "Serif" },
  robotoSlab: { label: "Roboto Slab", css: "'Roboto Slab Variable', 'Roboto Slab', Georgia, serif", group: "Serif" },
  comicNeue: { label: "Comic Neue", css: "'Comic Neue', 'Comic Sans MS', cursive", group: "Cómic" },
  patrickHand: { label: "Patrick Hand", css: "'Patrick Hand', 'Comic Sans MS', cursive", group: "Cómic" },
  bangers: { label: "Bangers (títulos)", css: "'Bangers', Impact, sans-serif", group: "Cómic" },
  arial: { label: "Arial", css: "Arial, Helvetica, sans-serif", group: "Sistema" },
  georgia: { label: "Georgia", css: "Georgia, 'Times New Roman', serif", group: "Sistema" },
  times: { label: "Times New Roman", css: "'Times New Roman', Times, serif", group: "Sistema" },
};

export function fontCss(id: FontId | "inherit" | undefined, fallback: FontId): string {
  if (!id || id === "inherit") return FONTS[fallback]?.css ?? FONTS.inter.css;
  return FONTS[id]?.css ?? FONTS.inter.css;
}
