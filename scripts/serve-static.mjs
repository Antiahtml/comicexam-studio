/**
 * Servidor estático mínimo que imita GitHub Pages: sirve la carpeta `out.nosync/` bajo una subcarpeta.
 * Uso: node scripts/serve-static.mjs [puerto] [subcarpeta]
 *   node scripts/serve-static.mjs 3100 /comicexam-studio
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] || process.env.PORT || 3100);
const base = (process.argv[3] ?? process.env.NEXT_PUBLIC_BASE_PATH ?? "/comicexam-studio").replace(/\/$/, "");
const root = path.resolve(process.cwd(), process.env.STATIC_DIR || "out.nosync");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".comicexam": "application/zip",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    let p = decodeURIComponent(url.pathname);
    if (base && p === base) {
      res.writeHead(301, { Location: `${base}/${url.search}` });
      return res.end();
    }
    if (base && !p.startsWith(`${base}/`)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    p = p.slice(base.length);
    let file = path.join(root, p);
    if (!file.startsWith(root)) {
      res.writeHead(400);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      return fs.createReadStream(path.join(root, "404.html")).pipe(res);
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, "127.0.0.1", () => console.log(`Sirviendo ${root} en http://127.0.0.1:${port}${base}/`));
