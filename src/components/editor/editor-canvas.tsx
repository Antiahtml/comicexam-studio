"use client";

import { useEffect, useMemo, useRef } from "react";
import { ArrowDown, ArrowUp, Copy, FilePlus2, Trash2 } from "lucide-react";
import { useEditor } from "@/store/editor-store";
import { EditorPage } from "./editor-page";
import { questionNumbers } from "@/lib/document/geometry";
import { Tip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { PX_PER_MM, pageSize } from "@/lib/document/units";
import { cn } from "@/lib/utils";

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

  // Zoom con Ctrl/Cmd + rueda
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const st = useEditor.getState();
      st.setZoom(st.zoom * (e.deltaY < 0 ? 1.08 : 0.92));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Al añadir una hoja, se desplaza hasta ella.
  const pageCount = doc.pages.length;
  const prevCount = useRef(pageCount);
  useEffect(() => {
    if (pageCount > prevCount.current) {
      const id = useEditor.getState().activePageId;
      requestAnimationFrame(() => scroller.current?.querySelector(`[data-page-wrapper="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    prevCount.current = pageCount;
  }, [pageCount]);

  // Al cambiar de hoja activa desde la tira de miniaturas, se desplaza hasta ella.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      scroller.current?.querySelector(`[data-page-wrapper="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("comicexam:scroll-to-page", handler);
    return () => window.removeEventListener("comicexam:scroll-to-page", handler);
  }, []);

  return (
    <div
      ref={scroller}
      className="thin-scroll relative min-h-0 flex-1 overflow-auto bg-canvas"
      data-testid="editor-canvas"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg !== undefined) {
          useEditor.getState().select([]);
        }
      }}
    >
      <div className="flex min-w-fit flex-col items-center gap-4 px-10 py-6" data-canvas-bg style={{ minWidth: width * PX_PER_MM * zoom + 80 }}>
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
