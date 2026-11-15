"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ArrowDown, ArrowUp, Copy, FilePlus2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { setPreferredPageResolver, useEditor } from "@/store/editor-store";
import { revealElements } from "./dom-utils";
import { clampZoom, setZoomAnchor, stopZoomAnimation, takeZoomAnchor } from "./zoom-motion";
import { EditorPage } from "./editor-page";
import { questionNumbers } from "@/lib/document/geometry";
import { Tip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { PX_PER_MM, pageSize } from "@/lib/document/units";
import { cn, scrollBehavior } from "@/lib/utils";

/** Zona central: todas las hojas del examen, con zoom y acciones por hoja. */
export function EditorCanvas() {
  const doc = useEditor((s) => s.doc);
  const zoom = useEditor((s) => s.zoom);
  const activePageId = useEditor((s) => s.activePageId);
  const numbers = useMemo(() => questionNumbers(doc), [doc]);
  const ctx = useMemo(() => ({ doc, numbers, quality: "screen" as const }), [doc, numbers]);
  const scroller = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const { width } = pageSize(doc.settings.orientation);

  /*
   * Zoom con Ctrl/Cmd + rueda o pellizco del trackpad: proporcional a la magnitud del gesto
   * (un pellizco suave da un cambio suave) y anclado al cursor. Se acumula el valor sin
   * redondear para que los pasos muy pequeños del pellizco no se pierdan al redondear.
   */
  const wheelZoom = useRef<number | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      stopZoomAnimation();
      const st = useEditor.getState();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const delta = Math.max(-10, Math.min(10, e.deltaY * unit));
      const acc = wheelZoom.current;
      const base = acc !== null && Math.abs(Math.round(acc * 100) / 100 - st.zoom) < 0.006 ? acc : st.zoom;
      const next = clampZoom(base * Math.exp(-delta * 0.01));
      wheelZoom.current = next;
      setZoomAnchor({ x: e.clientX, y: e.clientY });
      st.setZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /*
   * Anclaje del zoom: justo cuando cambia el zoom (antes de que React vuelva a pintar) se mide
   * qué punto de qué hoja está bajo el anclaje; tras pintar, se corrige el desplazamiento para
   * que ese punto siga en el mismo sitio de la pantalla.
   */
  const pendingAnchor = useRef<{ id: string; fx: number; fy: number; px: number; py: number } | null>(null);
  useEffect(
    () =>
      useEditor.subscribe((s, prev) => {
        const requested = takeZoomAnchor();
        if (s.zoom === prev.zoom || pendingAnchor.current) return;
        const sc = scroller.current;
        if (!sc) return;
        const box = sc.getBoundingClientRect();
        const p = requested ?? { x: box.left + box.width / 2, y: box.top + 56 + (box.height - 56) / 2 };
        let best: { id: string; r: DOMRect; d: number } | null = null;
        sc.querySelectorAll<HTMLElement>("[data-page-surface]").forEach((node) => {
          const r = node.getBoundingClientRect();
          const d = p.y < r.top ? r.top - p.y : p.y > r.bottom ? p.y - r.bottom : 0;
          if (!best || d < best.d) best = { id: node.dataset.pageSurface!, r, d };
        });
        if (!best) return;
        const { id, r } = best as { id: string; r: DOMRect };
        pendingAnchor.current = { id, fx: (p.x - r.left) / r.width, fy: (p.y - r.top) / r.height, px: p.x, py: p.y };
      }),
    [],
  );
  useLayoutEffect(() => {
    const a = pendingAnchor.current;
    pendingAnchor.current = null;
    const sc = scroller.current;
    const node = a && sc?.querySelector<HTMLElement>(`[data-page-surface="${a.id}"]`);
    if (!a || !sc || !node) return;
    const r = node.getBoundingClientRect();
    sc.scrollLeft += r.left + a.fx * r.width - a.px;
    sc.scrollTop += r.top + a.fy * r.height - a.py;
  }, [zoom]);

  // Al añadir una hoja, se desplaza hasta ella.
  const pageCount = doc.pages.length;
  const prevCount = useRef(pageCount);
  useEffect(() => {
    if (pageCount > prevCount.current) {
      const id = useEditor.getState().activePageId;
      requestAnimationFrame(() => scroller.current?.querySelector(`[data-page-wrapper="${id}"]`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
    }
    prevCount.current = pageCount;
  }, [pageCount]);

  /**
   * Hoja en la que debe ir lo que se inserte desde los paneles: la activa si se eligió hace un
   * momento o si se ve bien; si no, la que más espacio ocupa en pantalla.
   */
  useEffect(() => {
    const preferred = (): string | null => {
      const st = useEditor.getState();
      if (Date.now() - st.activeSetAt < 1500) return st.activePageId;
      const sc = scroller.current;
      if (!sc) return null;
      const view = sc.getBoundingClientRect();
      let best: string | null = null;
      let bestH = 0;
      let activeH = 0;
      sc.querySelectorAll<HTMLElement>("[data-page-wrapper]").forEach((w) => {
        const r = w.getBoundingClientRect();
        const h = Math.max(0, Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top));
        if (w.dataset.pageWrapper === st.activePageId) activeH = h;
        if (h > bestH) {
          bestH = h;
          best = w.dataset.pageWrapper!;
        }
      });
      return activeH >= view.height * 0.3 || activeH >= bestH ? st.activePageId : best;
    };
    setPreferredPageResolver(preferred);
    // Al dejar de desplazarse, la hoja activa pasa a ser la que se está viendo.
    const sc = scroller.current;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const id = preferred();
        if (id && id !== useEditor.getState().activePageId) useEditor.setState({ activePageId: id });
      }, 200);
    };
    sc?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      sc?.removeEventListener("scroll", onScroll);
      setPreferredPageResolver(null);
    };
  }, []);

  // Lo recién insertado se muestra y se resalta; si no cabía, se avisa de la hoja nueva.
  const lastInserted = useEditor((s) => s.lastInserted);
  useEffect(() => {
    if (!lastInserted) return;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => revealElements(lastInserted.ids, useEditor.getState().zoom)),
    );
    if (lastInserted.newPages > 0 && lastInserted.firstNewPage !== null) {
      const n = lastInserted.firstNewPage + 1;
      toast.info(lastInserted.newPages === 1 ? `No cabía en la hoja anterior: se ha añadido en la nueva hoja ${n}.` : `Se han creado ${lastInserted.newPages} hojas nuevas.`, {
        action: { label: "Deshacer", onClick: () => useEditor.getState().undo() },
      });
    }
    return () => cancelAnimationFrame(raf);
  }, [lastInserted]);

  // Al cambiar de hoja activa desde la tira de miniaturas, se desplaza hasta ella.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      scroller.current?.querySelector(`[data-page-wrapper="${id}"]`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    };
    window.addEventListener("comicexam:scroll-to-page", handler);
    return () => window.removeEventListener("comicexam:scroll-to-page", handler);
  }, []);

  return (
    <div
      ref={scroller}
      className="thin-scroll relative min-h-0 flex-1 scroll-pt-18 overflow-auto bg-canvas"
      data-testid="editor-canvas"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg !== undefined) {
          useEditor.getState().select([]);
        }
      }}
    >
      <div className="flex min-w-fit flex-col items-center gap-4 px-10 pt-20 pb-6" data-canvas-bg style={{ minWidth: width * PX_PER_MM * zoom + 80 }}>
        {doc.pages.map((page, i) => (
          <div key={page.id} data-page-wrapper={page.id} className="flex flex-col gap-1.5" data-canvas-bg>
            <div className="flex items-center justify-between px-0.5" style={{ width: width * PX_PER_MM * zoom }} data-canvas-bg>
              <button
                className={cn("text-xs font-semibold text-muted-foreground", activePageId === page.id && "text-primary")}
                onClick={() => useEditor.getState().setActivePage(page.id)}
              >
                Hoja {i + 1} de {doc.pages.length}
              </button>
              <div className="flex items-center gap-0.5">
                <Tip label="Subir hoja">
                  <Button variant="ghost" size="iconSm" disabled={i === 0} onClick={() => useEditor.getState().movePage(i, i - 1)} aria-label="Subir hoja">
                    <ArrowUp />
                  </Button>
                </Tip>
                <Tip label="Bajar hoja">
                  <Button variant="ghost" size="iconSm" disabled={i === doc.pages.length - 1} onClick={() => useEditor.getState().movePage(i, i + 1)} aria-label="Bajar hoja">
                    <ArrowDown />
                  </Button>
                </Tip>
                <Tip label="Duplicar hoja">
                  <Button variant="ghost" size="iconSm" onClick={() => useEditor.getState().duplicatePage(page.id)} aria-label="Duplicar hoja">
                    <Copy />
                  </Button>
                </Tip>
                <Tip label="Añadir hoja después">
                  <Button variant="ghost" size="iconSm" onClick={() => useEditor.getState().addPage(i)} aria-label="Añadir hoja después">
                    <FilePlus2 />
                  </Button>
                </Tip>
                <Tip label="Eliminar hoja">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="hover:text-destructive"
                    aria-label="Eliminar hoja"
                    onClick={async () => {
                      if (page.elements.length > 0) {
                        const ok = await confirm({
                          title: `¿Eliminar la hoja ${i + 1}?`,
                          description: `Contiene ${page.elements.length} elemento(s). Puedes deshacerlo con Ctrl/Cmd + Z.`,
                          confirmLabel: "Eliminar hoja",
                          destructive: true,
                        });
                        if (!ok) return;
                      }
                      useEditor.getState().deletePage(page.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </Tip>
              </div>
            </div>
            <EditorPage page={page} index={i} ctx={ctx} />
          </div>
        ))}
        <Button variant="outline" className="mt-2 border-dashed" onClick={() => useEditor.getState().addPage(doc.pages.length - 1)} data-testid="add-page">
          <FilePlus2 /> Añadir hoja
        </Button>
      </div>
    </div>
  );
}
