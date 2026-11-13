/**
 * Generador de páginas de cómic sintéticas (datos de prueba de uso libre).
 * Cada página tiene viñetas dibujadas con formas simples y un globo de texto que indica
 * el número de página y de viñeta, lo que permite verificar visualmente los recortes.
 */
import sharp from "sharp";

const PALETTE = ["#fde68a", "#bfdbfe", "#fecaca", "#bbf7d0", "#ddd6fe", "#fed7aa", "#a5f3fc", "#fbcfe8"];

type Panel = { x: number; y: number; w: number; h: number };

/** Distribuciones de viñetas en una página de W×H (márgenes de 40 px, calle de 24 px). */
function layout(page: number, W: number, H: number): Panel[] {
  const m = 40;
  const g = 24;
  const iw = W - 2 * m;
  const ih = H - 2 * m;
  const rows = page % 3 === 0 ? [1, 2, 1] : page % 3 === 1 ? [2, 1, 2] : [2, 2, 1];
  const rh = (ih - g * (rows.length - 1)) / rows.length;
  const panels: Panel[] = [];
  rows.forEach((cols, r) => {
    const cw = (iw - g * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) panels.push({ x: m + c * (cw + g), y: m + r * (rh + g), w: cw, h: rh });
  });
  return panels;
}

export function comicPageSvg(page: number, total: number, W = 1000, H = 1500, title = "Las aventuras de Lía"): string {
  const panels = layout(page, W, H);
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  panels.forEach((p, i) => {
    const color = PALETTE[(page + i) % PALETTE.length];
    const cx = p.x + p.w / 2;
    const ground = p.y + p.h * 0.82;
    parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${color}" stroke="#111" stroke-width="7"/>`);
    // suelo
    parts.push(`<line x1="${p.x + 4}" y1="${ground}" x2="${p.x + p.w - 4}" y2="${ground}" stroke="#111" stroke-width="4"/>`);
    // sol / luna
    parts.push(`<circle cx="${p.x + p.w - 60}" cy="${p.y + 60}" r="26" fill="${page % 2 ? "#f59e0b" : "#e5e7eb"}" stroke="#111" stroke-width="4"/>`);
    // personaje (monigote) proporcional a la viñeta
    const fx = cx - p.w * 0.15 + ((i * 37) % 40);
    const ch = p.h * 0.36;
    const r = ch * 0.16;
    const head = ground - ch;
    const hip = ground - ch * 0.35;
    // globo de texto (la cola se dibuja antes para quedar por debajo)
    const bw = Math.min(p.w - 40, 300);
    const bx = p.x + 20;
    const by = p.y + 20;
    parts.push(`<path d="M ${bx + 60} ${by + 60} L ${fx - 4} ${head - r - 8} L ${bx + 100} ${by + 60} Z" fill="#fff" stroke="#111" stroke-width="4" stroke-linejoin="round"/>`);
    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="72" rx="32" fill="#fff" stroke="#111" stroke-width="4"/>`);
    parts.push(
      `<text x="${bx + bw / 2}" y="${by + 47}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="#111">Pág. ${page} · V${i + 1}</text>`,
    );
    parts.push(`<circle cx="${fx}" cy="${head}" r="${r}" fill="#fff" stroke="#111" stroke-width="5"/>`);
    parts.push(`<line x1="${fx}" y1="${head + r}" x2="${fx}" y2="${hip}" stroke="#111" stroke-width="6"/>`);
    parts.push(`<line x1="${fx}" y1="${hip}" x2="${fx - r}" y2="${ground}" stroke="#111" stroke-width="6"/>`);
    parts.push(`<line x1="${fx}" y1="${hip}" x2="${fx + r}" y2="${ground}" stroke="#111" stroke-width="6"/>`);
    parts.push(`<line x1="${fx - r * 1.3}" y1="${head + r * 2.2}" x2="${fx + r * 1.3}" y2="${head + r * 2.2 - (i % 2) * r}" stroke="#111" stroke-width="6"/>`);
  });
  if (page === 1) {
    parts.push(`<rect x="60" y="${H / 2 - 70}" width="${W - 120}" height="140" fill="#4f46e5" stroke="#111" stroke-width="7"/>`);
    parts.push(`<text x="${W / 2}" y="${H / 2 + 22}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" text-anchor="middle" fill="#fff">${title}</text>`);
  }
  parts.push(`<text x="${W - 40}" y="${H - 12}" font-family="Arial" font-size="22" text-anchor="end" fill="#555">${page} / ${total}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

export async function renderComicPage(page: number, total: number, opts: { width?: number; height?: number; format?: "jpeg" | "png" } = {}): Promise<Buffer> {
  const W = opts.width ?? 1000;
  const H = opts.height ?? 1500;
  const img = sharp(Buffer.from(comicPageSvg(page, total, W, H)));
  return opts.format === "png" ? img.png().toBuffer() : img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}
