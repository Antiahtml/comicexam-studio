"use client";

import { create } from "zustand";
import type { DocSettings, ExamDocument, ExamElement, ExamMeta, ExamPage, ImageSource } from "@/lib/document/types";
import { alignBoxes, distributeBoxes, type AlignKind } from "@/lib/document/geometry";
import { cloneElement, clonePage, createImage, createPage, findInsertPosition, newId, placeElement } from "@/lib/document/factory";
import { printableArea, roundMm } from "@/lib/document/units";

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type LeftTab = "comics" | "panels" | "text" | "questions" | "answers" | "shapes" | "uploads" | "document";

const HISTORY_LIMIT = 100;

export interface EditorState {
  projectId: string;
  name: string;
  doc: ExamDocument;
  /** Se incrementa con cada cambio del documento (para el autoguardado). */
  version: number;
  savedVersion: number;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;

  selectedIds: string[];
  activePageId: string;
  /** Momento en que el usuario eligió la hoja activa explícitamente (clic, añadir hoja…). */
  activeSetAt: number;
  /** Último contenido insertado: el lienzo se desplaza hasta él y lo resalta. */
  lastInserted: { ids: string[]; nonce: number; newPages: number; firstNewPage: number | null } | null;
  editingId: string | null;
  zoom: number;
  showGuides: boolean;
  snap: boolean;
  leftTab: LeftTab;
  guides: { pageId: string; x: number[]; y: number[] } | null;

  past: ExamDocument[];
  future: ExamDocument[];
  gestureBase: ExamDocument | null;

  init: (p: { id: string; name: string; document: ExamDocument }) => void;
  setName: (name: string) => void;
  markSaving: () => void;
  markSaved: (version: number) => void;
  markSaveError: (msg: string) => void;

  /** Modifica el documento sobre una copia. Con history=false no se registra (arrastres en curso). */
  mutate: (fn: (doc: ExamDocument) => void, opts?: { history?: boolean; coalesce?: string }) => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;

  select: (ids: string[], mode?: "replace" | "toggle" | "add") => void;
  setActivePage: (id: string) => void;
  /** Desplaza la vista hasta unos elementos y los resalta. */
  reveal: (ids: string[]) => void;
  setEditing: (id: string | null) => void;
  setZoom: (z: number) => void;
  setLeftTab: (t: LeftTab) => void;
  toggleGuides: () => void;
  toggleSnap: () => void;
  setGuides: (g: EditorState["guides"]) => void;

  addElement: (el: ExamElement, opts?: { pageId?: string; at?: { x: number; y: number }; center?: boolean }) => void;
  insertImages: (sources: ImageSource[], layout: "auto" | "row" | "perPage", opts?: { pageId?: string; at?: { x: number; y: number } }) => void;
  updateElement: <T extends ExamElement>(id: string, patch: Partial<T> | ((el: T) => void), coalesce?: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  paste: () => void;
  nudge: (dx: number, dy: number) => void;
  moveElementToPage: (id: string, pageId: string, x?: number, y?: number) => void;
  reorder: (kind: "front" | "back" | "forward" | "backward") => void;
  reorderLayer: (pageId: string, from: number, to: number) => void;
  align: (kind: AlignKind) => void;
  distribute: (axis: "h" | "v") => void;
  matchWidth: () => void;
  /** Recoloca (y si hace falta reduce) un elemento para que quede dentro de los márgenes. */
  fitInsideMargins: (id: string) => void;

  addPage: (afterIndex?: number) => void;
  duplicatePage: (pageId: string) => void;
  deletePage: (pageId: string) => void;
  movePage: (from: number, to: number) => void;

  updateMeta: (patch: Partial<ExamMeta>, coalesce?: string) => void;
  updateSettings: (patch: Partial<DocSettings>, coalesce?: string) => void;
}

let clipboard: ExamElement[] = [];

/**
 * El lienzo registra aquí cómo saber qué hoja está viendo el usuario. Así, lo que se inserta
 * desde los paneles va a la hoja visible y no a una que quedó activa fuera de la pantalla.
 */
let preferredPageResolver: (() => string | null) | null = null;
export function setPreferredPageResolver(fn: (() => string | null) | null) {
  preferredPageResolver = fn;
}
let insertNonce = 0;
/** Agrupa en un solo paso de historial los cambios rápidos sobre el mismo campo (p. ej. al teclear). */
let lastCoalesce: { key: string; time: number } | null = null;

export function findElement(doc: ExamDocument, id: string): { page: ExamPage; pageIndex: number; el: ExamElement; index: number } | null {
  for (let p = 0; p < doc.pages.length; p++) {
    const page = doc.pages[p];
    const index = page.elements.findIndex((e) => e.id === id);
    if (index !== -1) return { page, pageIndex: p, el: page.elements[index], index };
  }
  return null;
}

const emptyDoc: ExamDocument = {
  version: 1,
  meta: { title: "", subject: "", course: "", date: "", totalScore: null, instructions: "" },
  settings: {
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    showPageNumbers: true,
    pageNumberFormat: "n",
    pageNumberPosition: "center",
    header: { enabled: false, left: "", center: "", right: "" },
    footer: { enabled: false, left: "", center: "", right: "" },
    fontFamily: "inter",
    showPoints: true,
  },
  pages: [{ id: "empty", elements: [] }],
};

export const useEditor = create<EditorState>()((set, get) => {
  /** Aplica un cambio con historial. */
  const commit = (fn: (doc: ExamDocument) => void, history = true, coalesce?: string) => {
    const { doc, past, version } = get();
    if (history && coalesce) {
      const now = Date.now();
      if (lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.time < 1200) history = false;
      lastCoalesce = { key: coalesce, time: now };
    } else if (history) lastCoalesce = null;
    const next = structuredClone(doc);
    fn(next);
    set({
      doc: next,
      version: version + 1,
      saveState: "dirty",
      ...(history ? { past: [...past, doc].slice(-HISTORY_LIMIT), future: [] } : {}),
    });
  };

  const selectedOnPage = (doc: ExamDocument, ids: string[]) => {
    const out: { page: ExamPage; el: ExamElement }[] = [];
    for (const page of doc.pages) for (const el of page.elements) if (ids.includes(el.id)) out.push({ page, el });
    return out;
  };

  const targetPage = (doc: ExamDocument, pageId?: string) => {
    const id = pageId ?? preferredPageResolver?.() ?? get().activePageId;
    return doc.pages.find((p) => p.id === id) ?? doc.pages.find((p) => p.id === get().activePageId) ?? doc.pages[doc.pages.length - 1];
  };

  /** Registra lo insertado para que el lienzo lo muestre, indicando si se crearon hojas. */
  const announce = (ids: string[], pagesBefore: string[]) => {
    const pages = get().doc.pages;
    const created = pages.map((p, i) => ({ p, i })).filter(({ p }) => !pagesBefore.includes(p.id));
    set({ lastInserted: { ids, nonce: ++insertNonce, newPages: created.length, firstNewPage: created[0]?.i ?? null } });
  };

  return {
    projectId: "",
    name: "",
    doc: emptyDoc,
    version: 0,
    savedVersion: 0,
    saveState: "saved",
    saveError: null,
    lastSavedAt: null,
    selectedIds: [],
    activePageId: "empty",
    activeSetAt: 0,
    lastInserted: null,
    editingId: null,
    zoom: 1,
    showGuides: true,
    snap: true,
    leftTab: "comics",
    guides: null,
    past: [],
    future: [],
    gestureBase: null,

    init: ({ id, name, document }) =>
      set({
        projectId: id,
        name,
        doc: document,
        version: 0,
        savedVersion: 0,
        saveState: "saved",
        saveError: null,
        lastSavedAt: Date.now(),
        selectedIds: [],
        activePageId: document.pages[0]?.id ?? "",
        activeSetAt: 0,
        lastInserted: null,
        editingId: null,
        past: [],
        future: [],
        gestureBase: null,
      }),
    setName: (name) => set((s) => ({ name, version: s.version + 1, saveState: "dirty" })),
    markSaving: () => set({ saveState: "saving" }),
    markSaved: (version) =>
      set((s) => ({ savedVersion: version, saveState: s.version === version ? "saved" : "dirty", saveError: null, lastSavedAt: Date.now() })),
    markSaveError: (msg) => set({ saveState: "error", saveError: msg }),

    mutate: (fn, opts) => commit(fn, opts?.history ?? true, opts?.coalesce),
    beginGesture: () => set({ gestureBase: get().doc }),
    endGesture: () => {
      const { gestureBase, doc, past } = get();
      if (gestureBase && gestureBase !== doc) set({ past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [] });
      set({ gestureBase: null, guides: null });
    },
    undo: () => {
      const { past, doc, future, version, selectedIds } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      const stillThere = selectedIds.filter((id) => findElement(prev, id));
      set({
        doc: prev,
        past: past.slice(0, -1),
        future: [doc, ...future].slice(0, HISTORY_LIMIT),
        version: version + 1,
        saveState: "dirty",
        selectedIds: stillThere,
        activePageId: prev.pages.some((p) => p.id === get().activePageId) ? get().activePageId : prev.pages[0].id,
      });
    },
    redo: () => {
      const { past, doc, future, version } = get();
      if (!future.length) return;
      const next = future[0];
      set({
        doc: next,
        past: [...past, doc],
        future: future.slice(1),
        version: version + 1,
        saveState: "dirty",
        activePageId: next.pages.some((p) => p.id === get().activePageId) ? get().activePageId : next.pages[0].id,
      });
    },

    select: (ids, mode = "replace") => {
      const cur = get().selectedIds;
      let next = ids;
      if (mode === "toggle") next = ids.reduce((acc, id) => (acc.includes(id) ? acc.filter((x) => x !== id) : [...acc, id]), cur);
      if (mode === "add") next = [...new Set([...cur, ...ids])];
      const found = next.length ? findElement(get().doc, next[next.length - 1]) : null;
      set({ selectedIds: next, editingId: null, ...(found ? { activePageId: found.page.id, activeSetAt: Date.now() } : {}) });
    },
    setActivePage: (id) => set({ activePageId: id, activeSetAt: Date.now() }),
    reveal: (ids) => set({ lastInserted: { ids, nonce: ++insertNonce, newPages: 0, firstNewPage: null } }),
    setEditing: (id) => set({ editingId: id }),
    setZoom: (z) => set({ zoom: Math.min(3, Math.max(0.25, Math.round(z * 100) / 100)) }),
    setLeftTab: (t) => set({ leftTab: t }),
    toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
    toggleSnap: () => set((s) => ({ snap: !s.snap })),
    setGuides: (g) => set({ guides: g }),

    addElement: (el, opts) => {
      const pagesBefore = get().doc.pages.map((p) => p.id);
      commit((doc) => {
        let page = targetPage(doc, opts?.pageId);
        let at = opts?.at;
        if (at && opts?.center) at = { x: at.x - el.w / 2, y: at.y - el.h / 2 };
        // Si no cabe debajo del contenido, va a una hoja nueva (nunca encima de lo que hay).
        if (!at && page.elements.length > 0 && !findInsertPosition(page, doc.settings, el.w, el.h).fits) {
          const np = createPage();
          doc.pages.splice(doc.pages.indexOf(page) + 1, 0, np);
          page = np;
        }
        placeElement(el, page, doc.settings, at);
        page.elements.push(el);
      });
      const found = findElement(get().doc, el.id);
      set({ selectedIds: [el.id], activePageId: found?.page.id ?? get().activePageId, activeSetAt: Date.now() });
      announce([el.id], pagesBefore);
    },

    insertImages: (sources, layout, opts) => {
      if (!sources.length) return;
      const ids: string[] = [];
      let lastPageId = get().activePageId;
      const pagesBefore = get().doc.pages.map((p) => p.id);
      commit((doc) => {
        const area = printableArea(doc.settings);
        let page = targetPage(doc, opts?.pageId);
        if (layout === "perPage") {
          // Cada imagen en su propia hoja (la primera en la hoja activa si está vacía).
          sources.forEach((src, i) => {
            if (i > 0 || page.elements.length > 0) {
              const np = createPage();
              const idx = doc.pages.indexOf(page);
              doc.pages.splice(idx + 1, 0, np);
              page = np;
            }
            const el = createImage(src, area.w, area.h);
            el.x = roundMm(area.x + (area.w - el.w) / 2);
            el.y = area.y;
            page.elements.push(el);
            ids.push(el.id);
          });
          lastPageId = page.id;
          return;
        }
        if (layout === "row") {
          // Viñetas una junto a otra, misma altura, repartiendo el ancho imprimible.
          const gap = 5;
          const maxH = area.h * 0.4;
          const aspects = sources.map((s) => (s.crop.w * s.pageWidth) / (s.crop.h * s.pageHeight));
          const totalAspect = aspects.reduce((a, b) => a + b, 0);
          const h = Math.min(maxH, (area.w - gap * (sources.length - 1)) / totalAspect);
          const rowW = h * totalAspect + gap * (sources.length - 1);
          let pos = findInsertPosition(page, doc.settings, rowW, h);
          if (!pos.fits && page.elements.length > 0) {
            const np = createPage();
            doc.pages.splice(doc.pages.indexOf(page) + 1, 0, np);
            page = np;
            pos = findInsertPosition(page, doc.settings, rowW, h);
          }
          let x = opts?.at ? opts.at.x : area.x + (area.w - rowW) / 2;
          const y = opts?.at ? opts.at.y : pos.y;
          sources.forEach((src, i) => {
            const el = createImage(src, h * aspects[i], h);
            el.x = roundMm(x);
            el.y = roundMm(y);
            x += el.w + gap;
            page.elements.push(el);
            ids.push(el.id);
          });
          lastPageId = page.id;
          return;
        }
        // auto: una debajo de otra
        for (const src of sources) {
          const el = createImage(src, area.w * 0.8, area.h * 0.42);
          const pos = findInsertPosition(page, doc.settings, el.w, el.h);
          if (!pos.fits && page.elements.length > 0 && !opts?.at) {
            const np = createPage();
            doc.pages.splice(doc.pages.indexOf(page) + 1, 0, np);
            page = np;
          }
          placeElement(el, page, doc.settings, opts?.at ? { x: opts.at.x - el.w / 2, y: opts.at.y - el.h / 2 } : undefined);
          if (!opts?.at) el.x = roundMm(area.x + (area.w - el.w) / 2);
          page.elements.push(el);
          ids.push(el.id);
        }
        lastPageId = page.id;
      });
      set({ selectedIds: ids, activePageId: lastPageId, activeSetAt: Date.now() });
      announce(ids, pagesBefore);
    },

    updateElement: (id, patch, coalesce) =>
      commit(
        (doc) => {
          const f = findElement(doc, id);
          if (!f) return;
          if (typeof patch === "function") patch(f.el as never);
          else Object.assign(f.el, patch);
        },
        true,
        coalesce ? `${id}:${coalesce}` : undefined,
      ),

    deleteSelected: () => {
      const ids = get().selectedIds;
      if (!ids.length) return;
      commit((doc) => {
        for (const p of doc.pages) p.elements = p.elements.filter((e) => !ids.includes(e.id) || e.locked);
      });
      set({ selectedIds: [], editingId: null });
    },

    duplicateSelected: () => {
      const ids = get().selectedIds;
      if (!ids.length) return;
      const newIds: string[] = [];
      commit((doc) => {
        for (const { page, el } of selectedOnPage(doc, ids)) {
          const copy = cloneElement(el, 5);
          copy.locked = false;
          page.elements.push(copy);
          newIds.push(copy.id);
        }
      });
      set({ selectedIds: newIds });
    },

    copySelected: () => {
      clipboard = selectedOnPage(get().doc, get().selectedIds).map(({ el }) => structuredClone(el));
    },
    cutSelected: () => {
      get().copySelected();
      get().deleteSelected();
    },
    paste: () => {
      if (!clipboard.length) return;
      const newIds: string[] = [];
      commit((doc) => {
        const page = targetPage(doc);
        for (const el of clipboard) {
          const exists = page.elements.some((e) => Math.abs(e.x - el.x) < 0.5 && Math.abs(e.y - el.y) < 0.5);
          const copy = cloneElement(el, exists ? 5 : 0);
          copy.locked = false;
          page.elements.push(copy);
          newIds.push(copy.id);
        }
      });
      set({ selectedIds: newIds });
    },

    nudge: (dx, dy) => {
      const ids = get().selectedIds;
      if (!ids.length) return;
      commit((doc) => {
        for (const { el } of selectedOnPage(doc, ids)) {
          if (el.locked) continue;
          el.x = roundMm(el.x + dx);
          el.y = roundMm(el.y + dy);
        }
      });
    },

    moveElementToPage: (id, pageId, x, y) => {
      commit((doc) => {
        const f = findElement(doc, id);
        const target = doc.pages.find((p) => p.id === pageId);
        if (!f || !target || f.page.id === pageId) return;
        f.page.elements.splice(f.index, 1);
        if (x !== undefined) f.el.x = roundMm(x);
        if (y !== undefined) f.el.y = roundMm(y);
        if (x === undefined && y === undefined) {
          const pos = findInsertPosition(target, doc.settings, f.el.w, f.el.h);
          f.el.x = Math.max(pos.x, f.el.x);
          f.el.y = pos.y;
        }
        target.elements.push(f.el);
      });
      set({ activePageId: pageId });
    },

    reorder: (kind) => {
      const ids = get().selectedIds;
      commit((doc) => {
        for (const page of doc.pages) {
          const sel = page.elements.filter((e) => ids.includes(e.id));
          if (!sel.length) continue;
          if (kind === "front") page.elements = [...page.elements.filter((e) => !ids.includes(e.id)), ...sel];
          else if (kind === "back") page.elements = [...sel, ...page.elements.filter((e) => !ids.includes(e.id))];
          else {
            const arr = page.elements;
            const order = kind === "forward" ? [...arr.keys()].reverse() : [...arr.keys()];
            for (const i of order) {
              if (!ids.includes(arr[i].id)) continue;
              const j = kind === "forward" ? i + 1 : i - 1;
              if (j < 0 || j >= arr.length || ids.includes(arr[j].id)) continue;
              [arr[i], arr[j]] = [arr[j], arr[i]];
            }
          }
        }
      });
    },
    reorderLayer: (pageId, from, to) =>
      commit((doc) => {
        const page = doc.pages.find((p) => p.id === pageId);
        if (!page) return;
        const [el] = page.elements.splice(from, 1);
        page.elements.splice(to, 0, el);
      }),

    align: (kind) => {
      const ids = get().selectedIds;
      commit((doc) => {
        const items = selectedOnPage(doc, ids).filter(({ el }) => !el.locked);
        const pageId = items[0]?.page.id;
        const same = items.filter((i) => i.page.id === pageId);
        const aligned = alignBoxes(
          same.map((i) => i.el),
          kind,
          doc.settings,
        );
        same.forEach((it, k) => {
          it.el.x = roundMm(aligned[k].x);
          it.el.y = roundMm(aligned[k].y);
        });
      });
    },
    distribute: (axis) => {
      const ids = get().selectedIds;
      commit((doc) => {
        const items = selectedOnPage(doc, ids);
        const res = distributeBoxes(
          items.map((i) => i.el),
          axis,
        );
        items.forEach((it, k) => {
          it.el.x = roundMm(res[k].x);
          it.el.y = roundMm(res[k].y);
        });
      });
    },
    matchWidth: () => {
      const ids = get().selectedIds;
      commit((doc) => {
        const area = printableArea(doc.settings);
        for (const { el } of selectedOnPage(doc, ids)) {
          const ratio = el.h / el.w;
          el.x = area.x;
          el.w = roundMm(area.w);
          if (el.type === "image" && el.lockAspect) el.h = roundMm(el.w * ratio);
        }
      });
    },

    fitInsideMargins: (id) =>
      commit((doc) => {
        const f = findElement(doc, id);
        if (!f) return;
        const e = f.el;
        const area = printableArea(doc.settings);
        const ratio = e.h / e.w;
        if (e.w > area.w) {
          e.w = roundMm(area.w);
          if (e.type === "image" && e.lockAspect) e.h = roundMm(e.w * ratio);
        }
        if (e.h > area.h) {
          e.h = roundMm(area.h);
          if (e.type === "image" && e.lockAspect) e.w = roundMm(e.h / ratio);
        }
        e.x = roundMm(Math.min(Math.max(e.x, area.x), area.x + area.w - e.w));
        e.y = roundMm(Math.min(Math.max(e.y, area.y), area.y + area.h - e.h));
      }),

    addPage: (afterIndex) => {
      const page = createPage();
      commit((doc) => {
        const idx = afterIndex ?? doc.pages.findIndex((p) => p.id === get().activePageId);
        doc.pages.splice((idx === -1 ? doc.pages.length - 1 : idx) + 1, 0, page);
      });
      set({ activePageId: page.id, activeSetAt: Date.now(), selectedIds: [] });
      return;
    },
    duplicatePage: (pageId) => {
      let newId = "";
      commit((doc) => {
        const idx = doc.pages.findIndex((p) => p.id === pageId);
        if (idx === -1) return;
        const copy = clonePage(doc.pages[idx]);
        newId = copy.id;
        doc.pages.splice(idx + 1, 0, copy);
      });
      if (newId) set({ activePageId: newId, activeSetAt: Date.now(), selectedIds: [] });
    },
    deletePage: (pageId) => {
      const { doc } = get();
      if (doc.pages.length <= 1) {
        // La última hoja no se elimina: se vacía.
        commit((d) => {
          d.pages[0].elements = [];
        });
        set({ selectedIds: [] });
        return;
      }
      const idx = doc.pages.findIndex((p) => p.id === pageId);
      commit((d) => {
        d.pages = d.pages.filter((p) => p.id !== pageId);
      });
      const pages = get().doc.pages;
      set({ activePageId: pages[Math.min(idx, pages.length - 1)].id, selectedIds: [] });
    },
    movePage: (from, to) =>
      commit((doc) => {
        if (from === to || from < 0 || to < 0 || from >= doc.pages.length || to >= doc.pages.length) return;
        const [p] = doc.pages.splice(from, 1);
        doc.pages.splice(to, 0, p);
      }),

    updateMeta: (patch, coalesce) =>
      commit(
        (doc) => {
          Object.assign(doc.meta, patch);
        },
        true,
        coalesce ? `meta:${coalesce}` : undefined,
      ),
    updateSettings: (patch, coalesce) =>
      commit(
        (doc) => {
          Object.assign(doc.settings, patch);
        },
        true,
        coalesce ? `settings:${coalesce}` : undefined,
      ),
  };
});

export { newId };
