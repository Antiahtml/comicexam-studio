import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Carpeta de compilación con sufijo .nosync para que iCloud no la sincronice.
  distDir: ".next.nosync",
  // Paquetes nativos / WASM que deben ejecutarse en Node y no empaquetarse.
  serverExternalPackages: ["sharp", "node-unrar-js", "playwright", "playwright-core", "yauzl", "@prisma/client"],
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
  // Chromium (generación de PDF) carga la vista de impresión desde 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
