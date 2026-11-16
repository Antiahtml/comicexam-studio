"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Lock, TriangleAlert, Scissors as CropIcon } from "lucide-react";
import { useEditor, findElement } from "@/store/editor-store";
import { PageSurface } from "@/components/document/page-surface";
import { elementBoxStyle, type RenderContext } from "@/components/document/element-content";
import type { ExamElement, ExamPage, ImageSource } from "@/lib/document/types";
import { boundingBox, intersects, pageWarnings, snapBox, type Box } from "@/lib/document/geometry";
import { PX_PER_MM, pageSize, printableArea, roundMm } from "@/lib/document/units";
import { createFromTemplate, DND_IMAGE, DND_TEMPLATE, type ElementTemplate } from "@/lib/document/templates";
import { cn } from "@/lib/utils";
import { fontCss } from "@/lib/document/fonts";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_CURSOR: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};
const MIN_SIZE = 2;

type Gesture =
  | {
      kind: "move";
      startX: number;
      startY: number;
      orig: Map<string, { x: number; y: number }>;
      started: boolean;
      pointerStartMm: { x: number; y: number };
    }
  | { kind: "resize"; id: string; handle: Handle; startX: number; startY: number; orig: Box; aspect: number; lock: boolean; rotation: number }
  | { kind: "rotate"; id: string; cx: number; cy: number }
  | { kind: "marquee"; start: { x: number; y: number }; current: { x: number; y: number }; additive: boolean };

function canRotate(el: ExamElement) {
  return el.type === "image" || el.type === "text" || el.type === "shape" || el.type === "box";
}

/** Una hoja del examen en el editor: dibuja los elementos y gestiona selección, arrastre y redimensionado. */
export const EditorPage = memo(function EditorPage({ page, index, ctx }: { page: ExamPage; index: number; ctx: RenderContext }) {
  const doc = ctx.doc;
  const zoom = useEditor((s) => s.zoom);
  const selectedIds = useEditor((s) => s.selectedIds);
  const editingId = useEditor((s) => s.editingId);
  const showGuides = useEditor((s) => s.showGuides);
  const guides = useEditor((s) => s.guides);
  const activePageId = useEditor((s) => s.activePageId);

  const { width, height } = pageSize(doc.settings.orientation);
  const scale = PX_PER_MM * zoom;
  const area = printableArea(doc.settings);
  const warnings = useMemo(() => pageWarnings(page, doc.settings), [page, doc.settings]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /** Último clic sobre un elemento, para detectar el doble clic (el evento dblclick nativo
   *  no siempre llega porque se cancela pointerdown para evitar selecciones de texto). */
  const lastDown = useRef<{ id: string; t: number; x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [overflowing, setOverflowing] = useState<Set<string>>(new Set());

  /** Punto del cursor en mm de esta hoja. */
  const toMm = (clientX: number, clientY: number) => {
    const r = surfaceRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };

  // Detecta contenido recortado (texto o preguntas que no caben en su caja).
  useLayoutEffect(() => {
    const root = surfaceRef.current;
    if (!root) return;
    const next = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-el-id]").forEach((node) => {
      const inner = node.querySelector<HTMLElement>("[data-content] > div");
      if (inner && inner.scrollHeight > inner.clientHeight + 2) next.add(node.dataset.elId!);
    });
    setOverflowing((prev) => (prev.size === next.size && [...next].every((x) => prev.has(x)) ? prev : next));
  }, [page, ctx]);

  /* ------------------------------- Gestos ------------------------------- */

  const startWindowListeners = () => {
    const move = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, [data-no-drag]")) return;
    const st = useEditor.getState();
    if (st.activePageId !== page.id) st.setActivePage(page.id);
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
    const elId = target.closest<HTMLElement>("[data-el-id]")?.dataset.elId;
    if (st.editingId && st.editingId !== elId) st.setEditing(null);
    e.preventDefault();

    if (elId) {
      const el = page.elements.find((x) => x.id === elId);
      if (!el) return;
      const prev = lastDown.current;
      const now = e.timeStamp;
      lastDown.current = { id: el.id, t: now, x: e.clientX, y: e.clientY };
      if (!handle && prev && prev.id === el.id && now - prev.t < 450 && Math.hypot(prev.x - e.clientX, prev.y - e.clientY) < 6) {
        lastDown.current = null;
        if (!el.locked) {
          st.select([el.id]);
          st.setEditing(el.id);
        }
        return;
      }
      if (handle === "rotate") {
        const node = target.closest<HTMLElement>("[data-el-id]")!.getBoundingClientRect();
        gesture.current = { kind: "rotate", id: el.id, cx: node.left + node.width / 2, cy: node.top + node.height / 2 };
        st.beginGesture();
        startWindowListeners();
        return;
      }
      if (handle) {
        gesture.current = {
          kind: "resize",
          id: el.id,
          handle: handle as Handle,
          startX: e.clientX,
          startY: e.clientY,
          orig: { x: el.x, y: el.y, w: el.w, h: el.h },
          aspect: el.w / el.h,
          lock: el.type === "image" && el.lockAspect,
          rotation: el.rotation,
        };
        st.beginGesture();
        startWindowListeners();
        return;
      }
      // Selección
      let ids = st.selectedIds;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        st.select([el.id], "toggle");
        return;
      }
      if (!ids.includes(el.id)) {
        st.select([el.id]);
        ids = [el.id];
      }
      const movable = page.elements.filter((x) => ids.includes(x.id) && !x.locked);
      if (!movable.length) return;
      gesture.current = {
        kind: "move",
        startX: e.clientX,
        startY: e.clientY,
        orig: new Map(movable.map((m) => [m.id, { x: m.x, y: m.y }])),
        started: false,
        pointerStartMm: toMm(e.clientX, e.clientY),
      };
      startWindowListeners();
      return;
    }
    // Clic en zona vacía: selección por recuadro
    const p = toMm(e.clientX, e.clientY);
    gesture.current = { kind: "marquee", start: p, current: p, additive: e.shiftKey };
    if (!e.shiftKey) st.select([]);
    startWindowListeners();
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const st = useEditor.getState();
    if (g.kind === "marquee") {
      g.current = toMm(e.clientX, e.clientY);
      const b = { x: Math.min(g.start.x, g.current.x), y: Math.min(g.start.y, g.current.y), w: Math.abs(g.current.x - g.start.x), h: Math.abs(g.current.y - g.start.y) };
      setMarquee(b);
      return;
    }
    if (g.kind === "move") {
      const dxPx = e.clientX - g.startX;
      const dyPx = e.clientY - g.startY;
      if (!g.started) {
        if (Math.hypot(dxPx, dyPx) < 3) return;
        g.started = true;
        st.beginGesture();
      }
      let dx = dxPx / scale;
      let dy = dyPx / scale;
      const ids = [...g.orig.keys()];
      if (st.snap && !e.altKey) {
        const moving = page.elements.filter((x) => g.orig.has(x.id));
        const bx1 = Math.min(...moving.map((m) => g.orig.get(m.id)!.x));
        const by1 = Math.min(...moving.map((m) => g.orig.get(m.id)!.y));
        const bx2 = Math.max(...moving.map((m) => g.orig.get(m.id)!.x + m.w));
        const by2 = Math.max(...moving.map((m) => g.orig.get(m.id)!.y + m.h));
        const others = page.elements.filter((x) => !g.orig.has(x.id)).map((o) => boundingBox(o));
        const snap = snapBox({ x: bx1 + dx, y: by1 + dy, w: bx2 - bx1, h: by2 - by1 }, others, doc.settings, 6 / scale);
        dx += snap.dx;
        dy += snap.dy;
        st.setGuides(snap.guidesX.length || snap.guidesY.length ? { pageId: page.id, x: snap.guidesX, y: snap.guidesY } : null);
      } else if (st.guides) st.setGuides(null);
      st.mutate(
        (d) => {
          for (const id of ids) {
            const f = findElement(d, id);
            if (!f) continue;
            const o = g.orig.get(id)!;
            f.el.x = roundMm(o.x + dx);
            f.el.y = roundMm(o.y + dy);
          }
        },
        { history: false },
      );
      return;
    }
    if (g.kind === "resize") {
      // Delta en el sistema de coordenadas del elemento (por si está girado).
      const rad = (-g.rotation * Math.PI) / 180;
      const rdx = (e.clientX - g.startX) / scale;
      const rdy = (e.clientY - g.startY) / scale;
      const dx = rdx * Math.cos(rad) - rdy * Math.sin(rad);
      const dy = rdx * Math.sin(rad) + rdy * Math.cos(rad);
      let { x, y, w, h } = g.orig;
      const hd = g.handle;
      if (hd.includes("e")) w = g.orig.w + dx;
      if (hd.includes("w")) {
        w = g.orig.w - dx;
        x = g.orig.x + dx;
      }
      if (hd.includes("s")) h = g.orig.h + dy;
      if (hd.includes("n")) {
        h = g.orig.h - dy;
        y = g.orig.y + dy;
      }
      const lock = g.lock !== e.shiftKey; // Mayús invierte el bloqueo de proporción
      if (lock) {
        if (hd.length === 2) {
          // Esquina: manda el eje con más cambio relativo
          if (Math.abs(w / g.orig.w - 1) > Math.abs(h / g.orig.h - 1)) h = w / g.aspect;
          else w = h * g.aspect;
          if (hd.includes("w")) x = g.orig.x + g.orig.w - w;
          if (hd.includes("n")) y = g.orig.y + g.orig.h - h;
        } else if (hd === "e" || hd === "w") {
          h = w / g.aspect;
        } else {
          w = h * g.aspect;
        }
      }
      if (w < MIN_SIZE) {
        if (hd.includes("w")) x -= MIN_SIZE - w;
        w = MIN_SIZE;
      }
      if (h < 1) {
        if (hd.includes("n")) y -= 1 - h;
        h = 1;
      }
      st.mutate(
        (d) => {
          const f = findElement(d, g.id);
          if (!f) return;
          f.el.x = roundMm(x);
          f.el.y = roundMm(y);
          f.el.w = roundMm(w);
          f.el.h = roundMm(h);
        },
        { history: false },
      );
      return;
    }
    if (g.kind === "rotate") {
      let deg = (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(deg) < 3) deg = 0;
      st.mutate(
        (d) => {
          const f = findElement(d, g.id);
          if (f) f.el.rotation = Math.round(deg);
        },
        { history: false },
      );
    }
  };

  const onUp = (e: PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    const st = useEditor.getState();
    if (!g) return;
    if (g.kind === "marquee") {
      setMarquee(null);
      const b = { x: Math.min(g.start.x, g.current.x), y: Math.min(g.start.y, g.current.y), w: Math.abs(g.current.x - g.start.x), h: Math.abs(g.current.y - g.start.y) };
      if (b.w < 1 && b.h < 1) return;
      const hits = page.elements.filter((el) => intersects(boundingBox(el), b)).map((el) => el.id);
      st.select(hits, g.additive ? "add" : "replace");
      return;
    }
    if (g.kind === "move" && g.started) {
      // ¿Se ha soltado sobre otra hoja? Entonces el elemento se traslada a esa hoja.
      const dropNode = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((n) => (n as HTMLElement).closest?.("[data-page-surface]") as HTMLElement | null)
        .find((n) => n && n.dataset.pageSurface !== page.id);
      if (dropNode) {
        const targetId = dropNode.dataset.pageSurface!;
        const r = dropNode.getBoundingClientRect();
        const pointerTarget = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
        st.mutate(
          (d) => {
            const target = d.pages.find((p) => p.id === targetId);
            if (!target) return;
            for (const [id, o] of g.orig) {
              const f = findElement(d, id);
              if (!f) continue;
              f.page.elements.splice(f.index, 1);
              f.el.x = roundMm(pointerTarget.x + (o.x - g.pointerStartMm.x));
              f.el.y = roundMm(pointerTarget.y + (o.y - g.pointerStartMm.y));
              target.elements.push(f.el);
            }
          },
          { history: false },
        );
        st.setActivePage(targetId);
      }
      st.endGesture();
      return;
    }
    if (g.kind === "resize" || g.kind === "rotate") st.endGesture();
  };

  /* ------------------------------- Soltar desde el panel ------------------------------- */

  const onDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes(DND_IMAGE) || types.includes(DND_TEMPLATE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!dragOver) setDragOver(true);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    setDragOver(false);
    const st = useEditor.getState();
    const at = toMm(e.clientX, e.clientY);
    const img = e.dataTransfer.getData(DND_IMAGE);
    const tpl = e.dataTransfer.getData(DND_TEMPLATE);
    if (!img && !tpl) return;
    e.preventDefault();
    if (img) {
      let src: ImageSource;
      try {
        src = JSON.parse(img);
      } catch {
        return;
      }
      // Soltar una viñeta sobre una pregunta "basada en imagen" la asocia a la pregunta.
      const qId = (e.target as HTMLElement).closest<HTMLElement>("[data-el-id]")?.dataset.elId;
      const q = qId ? page.elements.find((x) => x.id === qId) : null;
      if (q && q.type === "question" && q.kind === "image") {
        st.updateElement(q.id, { image: src });
        st.select([q.id]);
        return;
      }
      st.insertImages([src], "auto", { pageId: page.id, at });
      return;
    }
    try {
      const t = JSON.parse(tpl) as ElementTemplate;
      st.addElement(createFromTemplate(t), { pageId: page.id, at, center: true });
    } catch {
      /* plantilla no válida */
    }
  };

  /* ------------------------------- Render ------------------------------- */

  const hs = 8 / zoom; // tamaño de tirador constante en pantalla
  const singleSelected = selectedIds.length === 1 ? page.elements.find((x) => x.id === selectedIds[0]) : undefined;

  const renderElement = (el: ExamElement, content: React.ReactNode) => {
    const selected = selectedIds.includes(el.id);
    const outside = warnings.outside.get(el.id);
    const overlap = warnings.overlaps.has(el.id);
    const clipped = overflowing.has(el.id);
    const editing = editingId === el.id && el.type === "text";
    const outline = selected
      ? `${2 / zoom}px solid var(--selection)`
      : outside
        ? `${1.5 / zoom}px dashed #dc2626`
        : overlap || clipped
          ? `${1.5 / zoom}px dashed #f59e0b`
          : undefined;
    const problems = [
      outside === "outsidePage" ? "Se sale de la hoja: no se imprimirá completo." : outside === "outsideMargins" ? "Se sale de los márgenes de impresión." : null,
      overlap ? "Se superpone con otro elemento." : null,
      clipped ? "El contenido no cabe: amplía la caja o reduce el texto." : null,
    ].filter(Boolean) as string[];
    return (
      <div
        key={el.id}
        data-el-id={el.id}
        data-el-type={el.type}
        className={cn("group/el", !el.locked && "cursor-move")}
        style={{ ...elementBoxStyle(el), outline, outlineOffset: 0, zIndex: selected ? 5 : undefined }}
      >
        <div data-content style={{ width: "100%", height: "100%", pointerEvents: editing ? "auto" : "none" }}>
          {editing ? <InlineTextEditor el={el} /> : content}
        </div>
        {!selected && !outline && (
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/el:opacity-100" style={{ outline: `${1 / zoom}px solid #818cf8` }} />
        )}
        {(problems.length > 0 || el.locked) && (
          <div
            className="absolute flex items-center gap-0.5"
            style={{ right: 0, top: 0, transform: `translate(50%, -50%) scale(${1 / zoom})`, transformOrigin: "center" }}
            data-no-drag
          >
            {el.locked && (
              <span className="flex size-5 items-center justify-center rounded-full bg-slate-700 text-white shadow" title="Elemento bloqueado">
                <Lock className="size-3" />
              </span>
            )}
            {problems.length > 0 && (
              <span
                className={cn("flex size-5 items-center justify-center rounded-full text-white shadow", outside ? "bg-red-600" : "bg-amber-500")}
                title={problems.join("\n")}
                data-testid="element-warning"
              >
                {clipped && !outside && !overlap ? <CropIcon className="size-3" /> : <TriangleAlert className="size-3" />}
              </span>
            )}
          </div>
        )}
        {selected && singleSelected?.id === el.id && !el.locked && !editing && (
          <>
            {HANDLES.map((h) => (
              <span
                key={h}
                data-handle={h}
                className="absolute rounded-[2px] border border-selection bg-white shadow-sm"
                style={{
                  width: hs,
                  height: hs,
                  borderWidth: 1.5 / zoom,
                  cursor: HANDLE_CURSOR[h],
                  left: h.includes("w") ? -hs / 2 : h.includes("e") ? `calc(100% - ${hs / 2}px)` : `calc(50% - ${hs / 2}px)`,
                  top: h.includes("n") ? -hs / 2 : h.includes("s") ? `calc(100% - ${hs / 2}px)` : `calc(50% - ${hs / 2}px)`,
                }}
              />
            ))}
            {canRotate(el) && (
              <span
                data-handle="rotate"
                title="Girar (Mayús: de 15 en 15°)"
                className="absolute rounded-full border border-selection bg-white shadow-sm"
                style={{ width: hs * 1.3, height: hs * 1.3, borderWidth: 1.5 / zoom, left: `calc(50% - ${(hs * 1.3) / 2}px)`, top: -hs * 3.2, cursor: "grab" }}
              />
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn("relative mx-auto shadow-[0_2px_16px_rgba(15,23,42,0.12)] transition-shadow", activePageId === page.id && "shadow-[0_0_0_2px_rgba(79,70,229,0.35),0_4px_24px_rgba(15,23,42,0.16)]", dragOver && "shadow-[0_0_0_3px_#f59e0b]")}
      style={{ width: width * scale, height: height * scale }}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div
        ref={surfaceRef}
        data-page-surface={page.id}
        data-testid={`exam-page-${index + 1}`}
        onPointerDown={onPointerDown}
        style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: `${width}mm`, height: `${height}mm`, position: "absolute", left: 0, top: 0 }}
      >
        <PageSurface doc={doc} page={page} pageIndex={index} ctx={ctx} renderElement={renderElement}>
          {showGuides && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${area.x}mm`,
                top: `${area.y}mm`,
                width: `${area.w}mm`,
                height: `${area.h}mm`,
                outline: `${1 / zoom}px dashed rgba(79,70,229,0.35)`,
              }}
            />
          )}
          {guides?.pageId === page.id && (
            <>
              {guides.x.map((gx, i) => (
                <div key={`gx${i}`} className="pointer-events-none absolute top-0 bottom-0" style={{ left: `${gx}mm`, width: 0, borderLeft: `${1 / zoom}px solid #ec4899` }} />
              ))}
              {guides.y.map((gy, i) => (
                <div key={`gy${i}`} className="pointer-events-none absolute right-0 left-0" style={{ top: `${gy}mm`, height: 0, borderTop: `${1 / zoom}px solid #ec4899` }} />
              ))}
            </>
          )}
          {marquee && (
            <div
              className="pointer-events-none absolute bg-selection/10"
              style={{ left: `${marquee.x}mm`, top: `${marquee.y}mm`, width: `${marquee.w}mm`, height: `${marquee.h}mm`, outline: `${1 / zoom}px solid var(--selection)` }}
            />
          )}
        </PageSurface>
      </div>
    </div>
  );
});

/** Edición de texto directamente sobre la hoja (doble clic). */
function InlineTextEditor({ el }: { el: ExamElement }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const st = useEditor.getState();
    st.beginGesture();
    ref.current?.focus();
    ref.current?.select();
    return () => useEditor.getState().endGesture();
  }, []);
  if (el.type !== "text") return null;
  const s = el.style;
  const ctxFont = useEditor.getState().doc.settings.fontFamily;
  return (
    <textarea
      ref={ref}
      data-testid="inline-text-editor"
      defaultValue={el.text}
      onChange={(e) => {
        const v = e.target.value;
        useEditor.getState().mutate(
          (d) => {
            const f = findElement(d, el.id);
            if (f && f.el.type === "text") f.el.text = v;
          },
          { history: false },
        );
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") useEditor.getState().setEditing(null);
        e.stopPropagation();
      }}
      onBlur={() => useEditor.getState().setEditing(null)}
      style={{
        width: "100%",
        height: "100%",
        resize: "none",
        border: "none",
        outline: "none",
        boxSizing: "border-box",
        padding: `${s.padding}mm`,
        fontFamily: fontCss(s.fontFamily, ctxFont),
        fontSize: `${s.fontSize}pt`,
        fontWeight: s.bold ? 700 : 400,
        fontStyle: s.italic ? "italic" : "normal",
        textAlign: s.align,
        lineHeight: s.lineHeight,
        color: s.color,
        background: s.background ?? "rgba(238,242,255,0.6)",
        overflow: "hidden",
      }}
    />
  );
}
