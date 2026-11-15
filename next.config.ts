import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * Versión web estática (GitHub Pages): no hay servidor. Todo se ejecuta en el navegador y los datos
 * se guardan en IndexedDB. NEXT_PUBLIC_BASE_PATH es la subcarpeta donde se publica
 * (p. ej. "/comicexam-studio" para https://usuario.github.io/comicexam-studio/).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = (phase: string): NextConfig => ({
  output: "export",
  basePath,
  trailingSlash: true,
  // Carpetas con sufijo .nosync para que iCloud no las sincronice. La web estática publicable
  // queda en out.nosync/ (en una carpeta distinta a la de `next dev` para que no se pisen).
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next.nosync" : "out.nosync",
  images: { unoptimized: true },
  devIndicators: false,
  // No generar AGENTS.md automáticamente en `next dev`.
  agentRules: false,
  experimental: {
    // El servidor MCP de Next escribe un registro en <distDir>/dev/logs. Como distDir es
    // ".next.nosync" (por iCloud), Turbopack no lo ignora: cada línea del registro provocaba
    // una recompilación y una recarga, que a su vez escribían otra línea (bucle infinito).
    mcpServer: false,
  },
});

export default nextConfig;
