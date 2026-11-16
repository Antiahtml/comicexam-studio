"use client";

import { memo, useMemo } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useEditor } from "@/store/editor-store";
import { PageSurface } from "@/components/document/page-surface";
import { questionNumbers } from "@/lib/document/geometry";
import { PX_PER_MM, pageSize } from "@/lib/document/units";
import type { ExamDocument, ExamPage } from "@/lib/document/types";
import type { RenderContext } from "@/components/document/element-content";
import { cn } from "@/lib/utils";

const THUMB_W = 76;

const Thumb = memo(function Thumb({ page, index, ctx, active }: { page: ExamPage; index: number; ctx: RenderContext; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const { width, height } = pageSize(ctx.doc.settings.orientation);
  const scale = THUMB_W / (width * PX_PER_MM);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex shrink-0 flex-col items-center gap-1", isDragging && "z-10 opacity-80")}
      {...attributes}
      {...listeners}
    >
      <button
        className={cn(
          "relative overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-slate-300 transition-all hover:ring-selection/60",
          active && "ring-2 ring-selection",
        )}
        style={{ width: THUMB_W, height: (height / width) * THUMB_W }}
        onClick={() => {
          useEditor.getState().setActivePage(page.id);
          window.dispatchEvent(new CustomEvent("comicexam:scroll-to-page", { detail: page.id }));
        }}
        aria-label={`Ir a la hoja ${index + 1}`}
      >
        <div className="pointer-events-none origin-top-left" style={{ transform: `scale(${scale})` }}>
          <PageSurface doc={ctx.doc} page={page} pageIndex={index} ctx={ctx} />
        </div>
      </button>
      <span className={cn("text-2xs font-medium text-muted-foreground", active && "text-foreground")}>{index + 1}</span>
    </div>
  );
});

/** Miniaturas del documento. Se pueden reordenar arrastrándolas. */
export function PageStrip() {
  const doc = useEditor((s) => s.doc);
  const activePageId = useEditor((s) => s.activePageId);
  const numbers = useMemo(() => questionNumbers(doc), [doc]);
  const ctx = useMemo(() => ({ doc, numbers, quality: "thumb" as const }), [doc, numbers]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const pages = useEditor.getState().doc.pages;
    const from = pages.findIndex((p) => p.id === e.active.id);
    const to = pages.findIndex((p) => p.id === e.over!.id);
    useEditor.getState().movePage(from, to);
  };

  return (
    <div className="flex h-[132px] shrink-0 items-center gap-3 overflow-x-auto border-t bg-card px-4 thin-scroll" data-testid="page-strip">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={doc.pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
          {doc.pages.map((p, i) => (
            <Thumb key={p.id} page={p} index={i} ctx={ctx as RenderContext & { doc: ExamDocument }} active={p.id === activePageId} />
          ))}
        </SortableContext>
      </DndContext>
      <button
        onClick={() => useEditor.getState().addPage(doc.pages.length - 1)}
        className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-slate-300 text-muted-foreground hover:border-primary hover:text-foreground"
        style={{ width: THUMB_W, height: (pageSize(doc.settings.orientation).height / pageSize(doc.settings.orientation).width) * THUMB_W }}
        aria-label="Añadir hoja"
      >
        <Plus className="size-5" />
        <span className="text-2xs">Hoja</span>
      </button>
    </div>
  );
}
