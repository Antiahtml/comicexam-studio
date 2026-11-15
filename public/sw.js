/*
 * ComicExam Studio · service worker de medios.
 *
 * Sirve las imágenes guardadas en IndexedDB como si fueran archivos normales, para que la
 * interfaz (y la vista de impresión) pueda usar URLs:
 *   <base>/media/page/<pageId>?v=thumb|preview|original
 *   <base>/media/crop/<pageId>?r=x,y,w,h&max=<ancho máx. en px, 0 = original>
 * Los recortes se generan aquí a partir de la imagen ORIGINAL y se guardan en caché.
 * Nada sale del navegador.
 *
 * IMPORTANTE: debe coincidir con src/lib/local/db.ts (nombre, versión y almacenes).
 */
const DB_NAME = "comicexam-studio";
const DB_VERSION = 1;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      // Misma estructura que src/lib/local/db.ts (por si el worker abre la base antes que la app).
      const db = req.result;
      if (!db.objectStoreNames.contains("comics")) db.createObjectStore("comics", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages", { keyPath: "id" }).createIndex("comicId", "comicId");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("selections")) {
        const s = db.createObjectStore("selections", { keyPath: "id" });
        s.createIndex("comicId", "comicId");
        s.createIndex("pageId", "pageId");
      }
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("crops")) db.createObjectStore("crops");
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
const getDb = () => (dbPromise ??= openDb().catch((e) => ((dbPromise = null), Promise.reject(e))));

async function get(store, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, "readonly").objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function put(store, key, value) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const notFound = () => new Response("Imagen no disponible", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const ok = (blob) => new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream", "Cache-Control": "no-store" } });

/** Caja de recorte en píxeles enteros, redondeando hacia fuera (igual que src/lib/regions/coords.ts). */
function pixelBox(r, w, h) {
  const EPS = 1e-6;
  const left = Math.max(0, Math.floor(r.x * w + EPS));
  const top = Math.max(0, Math.floor(r.y * h + EPS));
  const right = Math.min(w, Math.ceil((r.x + r.w) * w - EPS));
  const bottom = Math.min(h, Math.ceil((r.y + r.h) * h - EPS));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

async function servePage(pageId, variant) {
  const v = variant === "thumb" || variant === "original" ? variant : "preview";
  const blob = await get("blobs", `${pageId}:${v}`);
  return blob ? ok(blob) : notFound();
}

async function serveCrop(pageId, params) {
  const parts = (params.get("r") || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return notFound();
  const rect = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  if (rect.w <= 0 || rect.h <= 0 || rect.x < 0 || rect.y < 0 || rect.x + rect.w > 1.000001 || rect.y + rect.h > 1.000001) return notFound();
  const max = Math.max(0, Math.min(6000, Math.round(Number(params.get("max") || 1400)) || 0));
  const key = `${pageId}:${parts.join(",")}:${max}`;
  const cached = await get("crops", key);
  if (cached) return ok(cached);

  const [page, original] = await Promise.all([get("pages", pageId), get("blobs", `${pageId}:original`)]);
  if (!page || !original) return notFound();
  const bitmap = await createImageBitmap(original);
  try {
    const box = pixelBox(rect, bitmap.width, bitmap.height);
    const scale = max > 0 && box.width > max ? max / box.width : 1;
    const w = Math.max(1, Math.round(box.width * scale));
    const h = Math.max(1, Math.round(box.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    const png = page.mime === "image/png";
    if (!png) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, box.left, box.top, box.width, box.height, 0, 0, w, h);
    const out = await canvas.convertToBlob(png ? { type: "image/png" } : { type: "image/jpeg", quality: max > 0 ? 0.86 : 0.95 });
    await put("crops", key, out).catch(() => undefined);
    return ok(out);
  } finally {
    bitmap.close();
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const base = new URL(self.registration.scope).pathname; // termina en "/"
  if (!url.pathname.startsWith(`${base}media/`)) return;
  const [, kind, rawId] = url.pathname.slice(base.length).split("/");
  const id = decodeURIComponent(rawId || "");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return event.respondWith(notFound());
  event.respondWith(
    (kind === "page" ? servePage(id, url.searchParams.get("v")) : kind === "crop" ? serveCrop(id, url.searchParams) : Promise.resolve(notFound())).catch(() =>
      notFound(),
    ),
  );
});
