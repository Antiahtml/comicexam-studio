"use client";

import { useMemo, useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  BringToFront,
  ChevronDown,
  ChevronUp,
  Copy,
  Crop,
  GripVertical,
  Italic,
  Lock,
  MoveHorizontal,
  Plus,
  SendToBack,
  StretchHorizontal,
  StretchVertical,
  Trash2,
  TriangleAlert,
  Underline,
  Unlock,
  X,
} from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEditor, findElement } from "@/store/editor-store";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { ColorField, Field, NumberField, Section, Segmented, SwitchRow, TextField } from "./fields";
import { CropDialog } from "./crop-dialog";
import { FONTS } from "@/lib/document/fonts";
import { QUESTION_LABELS } from "@/lib/document/factory";
import { pageWarnings, questionNumbers } from "@/lib/document/geometry";
import { PX_PER_MM, roundMm } from "@/lib/document/units";
import { cropAspect } from "@/lib/regions/coords";
import { cropUrl } from "@/lib/images/urls";
import type {
  BorderStyle,
  BoxElement,
  ExamElement,
  ExamHeaderElement,
  FontId,
  ImageElement,
  LinesElement,
  QuestionElement,
  QuestionKind,
  ShapeElement,
  TableElement,
  TextElement,
} from "@/lib/document/types";
import { cn } from "@/lib/utils";

export const TYPE_LABELS: Record<ExamElement["type"], string> = {
  text: "Texto",
  image: "Imagen",
  question: "Pregunta",
  lines: "Líneas de respuesta",
  box: "Cuadro de respuesta",
  table: "Tabla",
  shape: "Forma",
  examHeader: "Cabecera del examen",
};

function elementSummary(el: ExamElement, numbers: Map<string, string>): string {
  switch (el.type) {
    case "text":
      return el.text.split("\n")[0].slice(0, 40) || "Texto vacío";
    case "image":
      return el.src.label;
    case "question":
      return `${numbers.get(el.id)}. ${el.prompt.slice(0, 34)}`;
    case "lines":
      return `${el.count} líneas`;
    case "table":
      return `${el.rows} × ${el.cols}`;
    case "shape":
      return { rect: "Rectángulo", ellipse: "Elipse", hline: "Línea horizontal", vline: "Línea vertical", divider: el.title || "Separador" }[el.shape];
    case "box":
      return el.label || (el.grid ? "Cuadrícula" : "Cuadro");
    case "examHeader":
      return "Título, nombre y nota";
  }
}

/** Panel derecho: propiedades del elemento seleccionado (o de la hoja si no hay selección). */
export function PropertiesPanel() {
  const doc = useEditor((s) => s.doc);
  const selectedIds = useEditor((s) => s.selectedIds);
  const selected = useMemo(() => selectedIds.map((id) => findElement(doc, id)).filter(Boolean) as NonNullable<ReturnType<typeof findElement>>[], [doc, selectedIds]);

  return (
    <aside className="thin-scroll flex h-full w-[300px] shrink-0 flex-col overflow-y-auto border-l bg-card" data-testid="properties-panel">
      {selected.length === 0 ? <PagePanel /> : selected.length === 1 ? <ElementPanel key={selected[0].el.id} el={selected[0].el} pageIndex={selected[0].pageIndex} /> : <MultiPanel count={selected.length} />}
    </aside>
  );
}

/* ------------------------------- Sin selección ------------------------------- */

function LayerRow({ el, label, selected }: { el: ExamElement; label: string; selected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-1 text-xs", selected && "border-primary bg-secondary", isDragging && "z-10 shadow")}
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground" aria-label="Reordenar">
        <GripVertical className="size-3.5" />
      </span>
      <button className="min-w-0 flex-1 truncate text-left" onClick={() => useEditor.getState().select([el.id])}>
        <span className="font-medium">{TYPE_LABELS[el.type]}</span> <span className="text-muted-foreground">· {label}</span>
      </button>
      {el.locked && <Lock className="size-3 text-muted-foreground" />}
    </li>
  );
}

function PagePanel() {
  const doc = useEditor((s) => s.doc);
  const activePageId = useEditor((s) => s.activePageId);
  const pageIndex = Math.max(0, doc.pages.findIndex((p) => p.id === activePageId));
  const page = doc.pages[pageIndex];
  const numbers = useMemo(() => questionNumbers(doc), [doc]);
  const warnings = useMemo(() => pageWarnings(page, doc.settings), [page, doc.settings]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // La lista de capas se muestra de arriba (frente) a abajo (fondo).
  const layers = [...page.elements].reverse();
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const els = page.elements;
    const from = els.findIndex((x) => x.id === e.active.id);
    const to = els.findIndex((x) => x.id === e.over!.id);
    useEditor.getState().reorderLayer(page.id, from, to);
  };
  const problems = warnings.outside.size + new Set(warnings.overlaps.keys()).size;
  return (
    <>
      <Section title={`Hoja ${pageIndex + 1} de ${doc.pages.length}`}>
        <p className="text-xs text-muted-foreground">Selecciona un elemento para editarlo. Haz doble clic en un texto para escribir directamente.</p>
        {problems > 0 ? (
          <div className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {warnings.outside.size > 0 && <>{warnings.outside.size} elemento(s) fuera de la zona imprimible. </>}
              {warnings.overlaps.size > 0 && <>{warnings.overlaps.size} elemento(s) superpuestos.</>}
            </span>
          </div>
        ) : (
          page.elements.length > 0 && <p className="text-xs text-emerald-700">✓ Todo dentro de la zona imprimible y sin solapes.</p>
        )}
      </Section>
      <Section title={`Capas (${page.elements.length})`}>
        {layers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Hoja vacía. Añade elementos desde el panel izquierdo.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={layers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1">
                {layers.map((el) => (
                  <LayerRow key={el.id} el={el} label={elementSummary(el, numbers)} selected={false} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        <p className="text-[11px] text-muted-foreground">Arriba = delante. Arrastra para cambiar el orden.</p>
      </Section>
      <Section title="Atajos">
        <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <li className="font-mono">Supr</li>
          <li>Eliminar</li>
          <li className="font-mono">⌘/Ctrl D</li>
          <li>Duplicar</li>
          <li className="font-mono">⌘/Ctrl C · V</li>
          <li>Copiar y pegar (también entre hojas)</li>
          <li className="font-mono">⌘/Ctrl Z</li>
          <li>Deshacer (⇧ para rehacer)</li>
          <li className="font-mono">Flechas</li>
          <li>Mover 1 mm (⇧ 10 mm)</li>
          <li className="font-mono">Alt + arrastrar</li>
          <li>Sin ajuste magnético</li>
          <li className="font-mono">⇧ + clic</li>
          <li>Selección múltiple</li>
        </ul>
      </Section>
    </>
  );
}

/* ------------------------------- Selección múltiple ------------------------------- */

function AlignButtons() {
  const st = useEditor.getState();
  const items = [
    { k: "left", icon: AlignStartVertical, label: "Alinear a la izquierda" },
    { k: "hcenter", icon: AlignCenterVertical, label: "Centrar horizontalmente" },
    { k: "right", icon: AlignEndVertical, label: "Alinear a la derecha" },
    { k: "top", icon: AlignStartHorizontal, label: "Alinear arriba" },
    { k: "vcenter", icon: AlignCenterHorizontal, label: "Centrar verticalmente" },
    { k: "bottom", icon: AlignEndHorizontal, label: "Alinear abajo" },
  ] as const;
  return (
    <div className="flex justify-between">
      {items.map((i) => (
        <Tip key={i.k} label={i.label}>
          <Button variant="outline" size="iconSm" onClick={() => st.align(i.k)} aria-label={i.label}>
            <i.icon />
          </Button>
        </Tip>
      ))}
    </div>
  );
}

function MultiPanel({ count }: { count: number }) {
  const st = useEditor.getState();
  return (
    <>
      <Section title={`${count} elementos seleccionados`}>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => st.duplicateSelected()}>
            <Copy /> Duplicar
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => st.deleteSelected()}>
            <Trash2 /> Eliminar
          </Button>
        </div>
      </Section>
      <Section title="Alinear entre sí">
        <AlignButtons />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => st.distribute("h")} disabled={count < 3}>
            <StretchHorizontal /> Repartir horiz.
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => st.distribute("v")} disabled={count < 3}>
            <StretchVertical /> Repartir vert.
          </Button>
        </div>
      </Section>
      <Section title="Orden">
        <OrderButtons />
      </Section>
    </>
  );
}

function OrderButtons() {
  const st = useEditor.getState();
  return (
    <div className="grid grid-cols-4 gap-1.5">
      <Tip label="Traer al frente">
        <Button variant="outline" size="sm" onClick={() => st.reorder("front")} aria-label="Traer al frente">
          <BringToFront />
        </Button>
      </Tip>
      <Tip label="Subir una capa">
        <Button variant="outline" size="sm" onClick={() => st.reorder("forward")} aria-label="Subir una capa">
          <ChevronUp />
        </Button>
      </Tip>
      <Tip label="Bajar una capa">
        <Button variant="outline" size="sm" onClick={() => st.reorder("backward")} aria-label="Bajar una capa">
          <ChevronDown />
        </Button>
      </Tip>
      <Tip label="Enviar al fondo">
        <Button variant="outline" size="sm" onClick={() => st.reorder("back")} aria-label="Enviar al fondo">
          <SendToBack />
        </Button>
      </Tip>
    </div>
  );
}

/* ------------------------------- Un elemento ------------------------------- */

function ElementPanel({ el, pageIndex }: { el: ExamElement; pageIndex: number }) {
  const doc = useEditor((s) => s.doc);
  const st = useEditor.getState();
  const up = <T extends ExamElement>(patch: Partial<T>, coalesce?: string) => st.updateElement<T>(el.id, patch, coalesce);
  const page = doc.pages[pageIndex];
  const warnings = useMemo(() => pageWarnings(page, doc.settings), [page, doc.settings]);
  const outside = warnings.outside.get(el.id);
  const overlap = warnings.overlaps.get(el.id);

  /** Ajusta la altura de la caja a su contenido real (medido en el editor). */
  const fitHeight = () => {
    const node = document.querySelector<HTMLElement>(`[data-el-id="${el.id}"] [data-content] > div`);
    if (!node) return;
    const prev = node.style.height;
    node.style.height = "auto";
    const px = node.scrollHeight;
    node.style.height = prev;
    up({ h: roundMm(px / PX_PER_MM + 1) });
  };

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{TYPE_LABELS[el.type]}</h2>
          <p className="text-[11px] text-muted-foreground">Hoja {pageIndex + 1}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <Tip label={el.locked ? "Desbloquear" : "Bloquear posición"}>
            <Button variant="ghost" size="iconSm" onClick={() => up({ locked: !el.locked })} aria-label="Bloquear">
              {el.locked ? <Lock /> : <Unlock />}
            </Button>
          </Tip>
          <Tip label="Duplicar (⌘/Ctrl D)">
            <Button variant="ghost" size="iconSm" onClick={() => st.duplicateSelected()} aria-label="Duplicar">
              <Copy />
            </Button>
          </Tip>
          <Tip label="Eliminar (Supr)">
            <Button variant="ghost" size="iconSm" className="hover:text-destructive" onClick={() => st.deleteSelected()} aria-label="Eliminar" data-testid="delete-element">
              <Trash2 />
            </Button>
          </Tip>
        </div>
      </div>

      {(outside || overlap) && (
        <div className="mx-4 mt-3 flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {outside === "outsidePage" && <p>Se sale de la hoja: una parte no se imprimirá.</p>}
            {outside === "outsideMargins" && <p>Invade los márgenes de impresión.</p>}
            {overlap && <p>Se superpone con {overlap.length} elemento(s).</p>}
            {outside && (
              <button
                className="font-medium text-primary hover:underline"
                onClick={() =>
                  st.updateElement(el.id, (e: ExamElement) => {
                    const m = doc.settings.margins;
                    const pw = doc.settings.orientation === "portrait" ? 210 : 297;
                    const ph = doc.settings.orientation === "portrait" ? 297 : 210;
                    e.w = Math.min(e.w, pw - m.left - m.right);
                    e.h = Math.min(e.h, ph - m.top - m.bottom);
                    e.x = Math.min(Math.max(e.x, m.left), pw - m.right - e.w);
                    e.y = Math.min(Math.max(e.y, m.top), ph - m.bottom - e.h);
                  })
                }
              >
                Colocar dentro de los márgenes
              </button>
            )}
          </div>
        </div>
      )}

      {el.type === "text" && <TextProps el={el} />}
      {el.type === "image" && <ImageProps el={el} />}
      {el.type === "question" && <QuestionProps el={el} fitHeight={fitHeight} />}
      {el.type === "lines" && <LinesProps el={el} />}
      {el.type === "box" && <BoxProps el={el} />}
      {el.type === "table" && <TableProps el={el} />}
      {el.type === "shape" && <ShapeProps el={el} />}
      {el.type === "examHeader" && <HeaderProps el={el} fitHeight={fitHeight} />}

      <Section title="Posición y tamaño">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" unit="mm" value={el.x} step={0.5} onChange={(v) => up({ x: v }, "x")} testId="prop-x" />
          <NumberField label="Y" unit="mm" value={el.y} step={0.5} onChange={(v) => up({ y: v }, "y")} testId="prop-y" />
          <NumberField
            label="Ancho"
            unit="mm"
            value={el.w}
            min={1}
            step={0.5}
            testId="prop-w"
            onChange={(v) => up(el.type === "image" && el.lockAspect ? { w: v, h: roundMm((v * el.h) / el.w) } : { w: v }, "w")}
          />
          <NumberField
            label="Alto"
            unit="mm"
            value={el.h}
            min={0.5}
            step={0.5}
            testId="prop-h"
            onChange={(v) => up(el.type === "image" && el.lockAspect ? { h: v, w: roundMm((v * el.w) / el.h) } : { h: v }, "h")}
          />
          {(el.type === "image" || el.type === "text" || el.type === "shape" || el.type === "box") && (
            <NumberField label="Rotación" unit="°" value={el.rotation} min={-180} max={180} onChange={(v) => up({ rotation: v }, "rot")} />
          )}
        </div>
        {(el.type === "text" || el.type === "question") && (
          <Button variant="outline" size="sm" className="w-full" onClick={fitHeight}>
            <StretchVertical /> Ajustar altura al contenido
          </Button>
        )}
        <Button variant="outline" size="sm" className="w-full" onClick={() => st.matchWidth()}>
          <MoveHorizontal /> Ocupar todo el ancho imprimible
        </Button>
        <AlignButtons />
      </Section>

      <Section title="Orden y hoja">
        <OrderButtons />
        {doc.pages.length > 1 && (
          <Field label="Mover a la hoja">
            <select
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
              value={doc.pages[pageIndex].id}
              onChange={(e) => st.moveElementToPage(el.id, e.target.value)}
            >
              {doc.pages.map((p, i) => (
                <option key={p.id} value={p.id}>
                  Hoja {i + 1}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>
    </>
  );
}

/* ------------------------------- Bordes ------------------------------- */

function BorderSection({ border, onChange, title = "Borde" }: { border: BorderStyle; onChange: (b: BorderStyle, k: string) => void; title?: string }) {
  return (
    <Section title={title}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Grosor" unit="pt" value={border.width} min={0} max={20} step={0.25} onChange={(v) => onChange({ ...border, width: v }, "bw")} />
        <NumberField label="Esquinas" unit="mm" value={border.radius} min={0} max={50} step={0.5} onChange={(v) => onChange({ ...border, radius: v }, "br")} />
      </div>
      {border.width > 0 && (
        <>
          <ColorField label="Color" value={border.color} onChange={(v) => onChange({ ...border, color: v ?? "#000000" }, "bc")} />
          <Segmented
            value={border.style}
            onChange={(v) => onChange({ ...border, style: v }, "bs")}
            options={[
              { value: "solid", label: "Continuo" },
              { value: "dashed", label: "Discontinuo" },
              { value: "dotted", label: "Punteado" },
            ]}
          />
        </>
      )}
    </Section>
  );
}

function FontSelect({ value, onChange, allowInherit = true }: { value: FontId | "inherit"; onChange: (v: FontId | "inherit") => void; allowInherit?: boolean }) {
  return (
    <select className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value as FontId | "inherit")}>
      {allowInherit && <option value="inherit">Fuente del documento</option>}
      {Object.entries(FONTS).map(([id, f]) => (
        <option key={id} value={id}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------- Texto ------------------------------- */

function TextProps({ el }: { el: TextElement }) {
  const st = useEditor.getState();
  const editingId = useEditor((s) => s.editingId);
  const s = el.style;
  const setStyle = (patch: Partial<TextElement["style"]>, k?: string) => st.updateElement<TextElement>(el.id, { style: { ...s, ...patch } }, k);
  return (
    <>
      <Section title="Contenido">
        <TextField multiline rows={4} value={el.text} onChange={(v) => st.updateElement<TextElement>(el.id, { text: v }, "text")} testId="prop-text" autoFocus={editingId === el.id} />
      </Section>
      <Section title="Tipografía">
        <FontSelect value={s.fontFamily} onChange={(v) => setStyle({ fontFamily: v })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Tamaño" unit="pt" value={s.fontSize} min={4} max={200} step={0.5} onChange={(v) => setStyle({ fontSize: v }, "fs")} testId="prop-font-size" />
          <NumberField label="Interlineado" value={s.lineHeight} min={0.5} max={4} step={0.05} onChange={(v) => setStyle({ lineHeight: v }, "lh")} />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border border-input bg-muted p-0.5">
            {(
              [
                ["bold", Bold, "Negrita"],
                ["italic", Italic, "Cursiva"],
                ["underline", Underline, "Subrayado"],
              ] as const
            ).map(([k, Icon, label]) => (
              <Tip key={k} label={label}>
                <button
                  className={cn("flex size-7 items-center justify-center rounded-[5px] text-muted-foreground", s[k] && "bg-card text-foreground shadow-sm")}
                  onClick={() => setStyle({ [k]: !s[k] })}
                  aria-pressed={s[k]}
                  aria-label={label}
                >
                  <Icon className="size-4" />
                </button>
              </Tip>
            ))}
          </div>
          <Segmented
            className="flex-1"
            value={s.align}
            onChange={(v) => setStyle({ align: v })}
            options={[
              { value: "left", label: <AlignLeft />, title: "Izquierda" },
              { value: "center", label: <AlignCenter />, title: "Centro" },
              { value: "right", label: <AlignRight />, title: "Derecha" },
              { value: "justify", label: <AlignJustify />, title: "Justificado" },
            ]}
          />
        </div>
        <ColorField label="Color" value={s.color} onChange={(v) => setStyle({ color: v ?? "#111827" }, "color")} />
        <ColorField label="Fondo" value={s.background} allowNone onChange={(v) => setStyle({ background: v }, "bg")} />
        <NumberField label="Relleno interior" unit="mm" value={s.padding} min={0} max={30} step={0.5} onChange={(v) => setStyle({ padding: v }, "pad")} />
      </Section>
      <BorderSection border={el.border} onChange={(b, k) => st.updateElement<TextElement>(el.id, { border: b }, k)} />
    </>
  );
}

/* ------------------------------- Imagen ------------------------------- */

function ImageProps({ el }: { el: ImageElement }) {
  const st = useEditor.getState();
  const [cropOpen, setCropOpen] = useState(false);
  const aspect = cropAspect(el.src.crop, el.src.pageWidth, el.src.pageHeight);
  const pxW = Math.round(el.src.crop.w * el.src.pageWidth);
  const pxH = Math.round(el.src.crop.h * el.src.pageHeight);
  // Resolución efectiva al imprimir (píxeles por pulgada)
  const dpi = Math.round(Math.min(pxW / (el.w / 25.4), pxH / (el.h / 25.4)));
  return (
    <>
      <Section title="Imagen">
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cropUrl(el.src.pageId, el.src.crop, "thumb")} alt="" className="h-20 w-20 shrink-0 rounded border bg-white object-contain" />
          <div className="min-w-0 space-y-1 text-xs">
            <p className="font-medium leading-snug">{el.src.label}</p>
            <p className="text-muted-foreground tabular-nums">
              {pxW} × {pxH} px
            </p>
            <p className={cn("tabular-nums", dpi < 150 ? "text-amber-700" : "text-emerald-700")}>
              {dpi} ppp al imprimir {dpi < 150 ? "· calidad baja" : "· buena calidad"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => setCropOpen(true)} data-testid="edit-crop">
          <Crop /> Recortar…
        </Button>
        <CropDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          src={el.src}
          onSave={(rect) =>
            st.updateElement<ImageElement>(el.id, (e) => {
              e.src = { ...e.src, crop: rect };
              if (e.lockAspect) e.h = roundMm(e.w / cropAspect(rect, e.src.pageWidth, e.src.pageHeight));
            })
          }
        />
      </Section>
      <Section title="Ajuste">
        <Segmented
          value={el.fit}
          onChange={(v) => st.updateElement<ImageElement>(el.id, { fit: v })}
          options={[
            { value: "contain", label: "Contener", title: "Se ve entera" },
            { value: "cover", label: "Rellenar", title: "Llena la caja recortando" },
            { value: "fill", label: "Estirar", title: "Deforma la imagen" },
          ]}
        />
        <SwitchRow label="Mantener proporción" checked={el.lockAspect} onChange={(v) => st.updateElement<ImageElement>(el.id, { lockAspect: v })} />
        <Button variant="outline" size="sm" className="w-full" onClick={() => st.updateElement<ImageElement>(el.id, { h: roundMm(el.w / aspect) })}>
          Restablecer proporción original
        </Button>
        <Field label={`Opacidad · ${Math.round(el.opacity * 100)} %`}>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(el.opacity * 100)}
            onChange={(e) => st.updateElement<ImageElement>(el.id, { opacity: Number(e.target.value) / 100 }, "op")}
            className="w-full accent-indigo-600"
          />
        </Field>
        <Field label="Pie de imagen">
          <TextField value={el.caption} onChange={(v) => st.updateElement<ImageElement>(el.id, { caption: v }, "cap")} placeholder="Opcional" />
        </Field>
      </Section>
      <BorderSection border={el.border} onChange={(b, k) => st.updateElement<ImageElement>(el.id, { border: b }, k)} />
    </>
  );
}

/* ------------------------------- Pregunta ------------------------------- */

function ListEditor({ items, onChange, placeholder, max = 26, prefix }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number; prefix?: (i: number) => string }) {
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {prefix && <span className="w-5 shrink-0 text-right text-xs font-semibold text-muted-foreground">{prefix(i)}</span>}
          <input
            value={it}
            onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
          />
          <button className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Quitar">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {items.length < max && (
        <Button variant="ghost" size="sm" className="text-primary" onClick={() => onChange([...items, placeholder])}>
          <Plus /> Añadir
        </Button>
      )}
    </div>
  );
}

function QuestionProps({ el, fitHeight }: { el: QuestionElement; fitHeight: () => void }) {
  const st = useEditor.getState();
  const editingId = useEditor((s) => s.editingId);
  const doc = useEditor((s) => s.doc);
  const auto = useMemo(() => questionNumbers({ ...doc, pages: doc.pages.map((p) => ({ ...p, elements: p.elements.map((e) => (e.id === el.id && e.type === "question" ? { ...e, number: null } : e)) })) }).get(el.id), [doc, el.id]);
  const up = (patch: Partial<QuestionElement>, k?: string) => st.updateElement<QuestionElement>(el.id, patch, k);
  const hasLines = el.kind === "short" || el.kind === "long" || el.kind === "image";
  return (
    <>
      <Section title="Pregunta">
        <Field label="Tipo de respuesta">
          <select
            className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
            value={el.kind}
            data-testid="prop-question-kind"
            onChange={(e) => {
              const kind = e.target.value as QuestionKind;
              st.updateElement<QuestionElement>(el.id, (q) => {
                q.kind = kind;
                if (kind === "multiple" && q.options.length === 0) q.options = ["Opción A", "Opción B", "Opción C"];
                if (kind === "truefalse" && q.statements.length === 0) q.statements = ["Afirmación 1", "Afirmación 2"];
                if (kind === "match" && q.pairs.length === 0) q.pairs = [{ left: "Concepto 1", right: "Definición 1" }, { left: "Concepto 2", right: "Definición 2" }];
                if ((kind === "short" || kind === "long" || kind === "image") && q.lines === 0) q.lines = kind === "short" ? 1 : 4;
              });
            }}
          >
            {Object.entries(QUESTION_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Enunciado">
          <TextField multiline rows={3} value={el.prompt} onChange={(v) => up({ prompt: v }, "prompt")} testId="prop-prompt" autoFocus={editingId === el.id} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Número">
            <input
              value={el.number ?? ""}
              placeholder={`Auto (${auto})`}
              onChange={(e) => up({ number: e.target.value.trim() ? e.target.value.slice(0, 20) : null }, "num")}
              onKeyDown={(e) => e.stopPropagation()}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
            />
          </Field>
          <NumberField label="Puntuación" unit="pt" value={el.points ?? 0} min={0} step={0.25} onChange={(v) => up({ points: v }, "pts")} testId="prop-points" />
        </div>
      </Section>

      {el.kind === "multiple" && (
        <Section title="Opciones">
          <ListEditor items={el.options} onChange={(options) => up({ options }, "opts")} placeholder="Nueva opción" prefix={(i) => `${"abcdefghijklmnopqrstuvwxyz"[i]})`} />
          <NumberField label="Columnas" value={el.optionColumns} min={1} max={4} onChange={(v) => up({ optionColumns: Math.round(v) })} />
        </Section>
      )}
      {el.kind === "truefalse" && (
        <Section title="Afirmaciones">
          <ListEditor items={el.statements} onChange={(statements) => up({ statements }, "stm")} placeholder="Nueva afirmación" max={40} prefix={(i) => `${"abcdefghijklmnopqrstuvwxyz"[i]})`} />
        </Section>
      )}
      {el.kind === "match" && (
        <Section title="Parejas (columna A ↔ columna B)">
          <div className="space-y-1.5">
            {el.pairs.map((p, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  value={p.left}
                  onChange={(e) => up({ pairs: el.pairs.map((x, k) => (k === i ? { ...x, left: e.target.value } : x)) }, "pairs")}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-xs outline-none"
                />
                <span className="text-muted-foreground">↔</span>
                <input
                  value={p.right}
                  onChange={(e) => up({ pairs: el.pairs.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)) }, "pairs")}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-xs outline-none"
                />
                <button className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => up({ pairs: el.pairs.filter((_, k) => k !== i) })} aria-label="Quitar pareja">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {el.pairs.length < 26 && (
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => up({ pairs: [...el.pairs, { left: "", right: "" }] })}>
                <Plus /> Añadir pareja
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">Escribe la columna B ya desordenada: se imprime tal cual.</p>
          </div>
        </Section>
      )}
      {el.kind === "image" && (
        <Section title="Imagen de la pregunta">
          {el.image ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cropUrl(el.image.pageId, el.image.crop, "thumb")} alt="" className="h-14 w-14 rounded border bg-white object-contain" />
              <p className="min-w-0 flex-1 text-xs">{el.image.label}</p>
              <Button variant="ghost" size="iconSm" onClick={() => up({ image: null })} aria-label="Quitar imagen">
                <X />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Arrastra una viñeta desde el panel «Viñetas» o «Cómics» y suéltala sobre esta pregunta.</p>
          )}
          <NumberField label="Alto de la imagen" unit="mm" value={el.imageHeight} min={5} max={250} onChange={(v) => up({ imageHeight: v }, "ih")} />
        </Section>
      )}
      {hasLines && (
        <Section title="Espacio para responder">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Líneas" value={el.lines} min={0} max={80} onChange={(v) => up({ lines: Math.round(v) }, "lines")} testId="prop-lines" />
            <NumberField label="Separación" unit="mm" value={el.lineSpacing} min={4} max={30} step={0.5} onChange={(v) => up({ lineSpacing: v }, "ls")} />
          </div>
          <Segmented
            value={el.lineStyle}
            onChange={(v) => up({ lineStyle: v })}
            options={[
              { value: "solid", label: "Continua" },
              { value: "dashed", label: "Discontinua" },
              { value: "dotted", label: "Puntos" },
            ]}
          />
        </Section>
      )}
      <Section title="Estilo">
        <FontSelect value={el.fontFamily} onChange={(v) => up({ fontFamily: v })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Tamaño" unit="pt" value={el.fontSize} min={6} max={40} step={0.5} onChange={(v) => up({ fontSize: v }, "fs")} />
          <div className="flex items-end">
            <SwitchRow
              label="Enmarcar"
              checked={el.border.width > 0}
              onChange={(v) => up({ border: v ? { width: 0.75, color: "#6b7280", radius: 2, style: "solid" } : { ...el.border, width: 0 } })}
            />
          </div>
        </div>
        <ColorField label="Color" value={el.color} onChange={(v) => up({ color: v ?? "#111827" }, "color")} />
        <Button variant="outline" size="sm" className="w-full" onClick={fitHeight} data-testid="fit-height">
          <StretchVertical /> Ajustar altura al contenido
        </Button>
      </Section>
    </>
  );
}

/* ------------------------------- Respuestas y formas ------------------------------- */

function LinesProps({ el }: { el: LinesElement }) {
  const st = useEditor.getState();
  const up = (patch: Partial<LinesElement>, k?: string) =>
    st.updateElement<LinesElement>(
      el.id,
      (e) => {
        Object.assign(e, patch);
        e.h = roundMm(e.count * e.spacing + 1);
      },
      k,
    );
  return (
    <Section title="Líneas">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Número" value={el.count} min={1} max={100} onChange={(v) => up({ count: Math.round(v) }, "count")} testId="prop-line-count" />
        <NumberField label="Separación" unit="mm" value={el.spacing} min={3} max={40} step={0.5} onChange={(v) => up({ spacing: v }, "sp")} />
        <NumberField label="Grosor" unit="pt" value={el.thickness} min={0.1} max={5} step={0.1} onChange={(v) => up({ thickness: v }, "th")} />
      </div>
      <Segmented
        value={el.lineStyle}
        onChange={(v) => up({ lineStyle: v })}
        options={[
          { value: "solid", label: "Continua" },
          { value: "dashed", label: "Discontinua" },
          { value: "dotted", label: "Puntos" },
        ]}
      />
      <ColorField label="Color" value={el.color} onChange={(v) => up({ color: v ?? "#6b7280" }, "c")} />
      <p className="text-[11px] text-muted-foreground">La altura se ajusta automáticamente al número de líneas.</p>
    </Section>
  );
}

function BoxProps({ el }: { el: BoxElement }) {
  const st = useEditor.getState();
  const up = (patch: Partial<BoxElement>, k?: string) => st.updateElement<BoxElement>(el.id, patch, k);
  return (
    <>
      <Section title="Cuadro de respuesta">
        <Field label="Etiqueta">
          <TextField value={el.label} onChange={(v) => up({ label: v }, "label")} placeholder="Respuesta:" />
        </Field>
        <NumberField label="Cuadrícula (0 = sin cuadrícula)" unit="mm" value={el.grid} min={0} max={30} step={1} onChange={(v) => up({ grid: v }, "grid")} />
        <ColorField label="Fondo" value={el.background} allowNone onChange={(v) => up({ background: v }, "bg")} />
      </Section>
      <BorderSection border={el.border} onChange={(b, k) => up({ border: b }, k)} />
    </>
  );
}

function TableProps({ el }: { el: TableElement }) {
  const st = useEditor.getState();
  const resize = (rows: number, cols: number) =>
    st.updateElement<TableElement>(el.id, (t) => {
      t.rows = rows;
      t.cols = cols;
      t.cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => t.cells[r]?.[c] ?? ""));
    });
  return (
    <Section title="Tabla">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Filas" value={el.rows} min={1} max={40} onChange={(v) => resize(Math.round(v), el.cols)} />
        <NumberField label="Columnas" value={el.cols} min={1} max={12} onChange={(v) => resize(el.rows, Math.round(v))} />
        <NumberField label="Tamaño de letra" unit="pt" value={el.fontSize} min={4} max={48} step={0.5} onChange={(v) => st.updateElement<TableElement>(el.id, { fontSize: v }, "fs")} />
      </div>
      <SwitchRow label="Primera fila como cabecera" checked={el.headerRow} onChange={(v) => st.updateElement<TableElement>(el.id, { headerRow: v })} />
      <ColorField label="Bordes" value={el.borderColor} onChange={(v) => st.updateElement<TableElement>(el.id, { borderColor: v ?? "#4b5563" }, "bc")} />
      <p className="text-[11px] font-medium text-muted-foreground">Contenido de las celdas</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${el.cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: el.rows }, (_, r) =>
          Array.from({ length: el.cols }, (_, c) => (
            <input
              key={`${r}-${c}`}
              value={el.cells[r]?.[c] ?? ""}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                st.updateElement<TableElement>(
                  el.id,
                  (t) => {
                    t.cells = Array.from({ length: t.rows }, (_, rr) => Array.from({ length: t.cols }, (_, cc) => t.cells[rr]?.[cc] ?? ""));
                    t.cells[r][c] = e.target.value;
                  },
                  `cell-${r}-${c}`,
                )
              }
              className={cn("h-7 min-w-0 rounded border border-input bg-card px-1 text-[11px] outline-none focus-visible:border-ring", el.headerRow && r === 0 && "font-semibold")}
            />
          )),
        )}
      </div>
    </Section>
  );
}

function ShapeProps({ el }: { el: ShapeElement }) {
  const st = useEditor.getState();
  const up = (patch: Partial<ShapeElement>, k?: string) => st.updateElement<ShapeElement>(el.id, patch, k);
  return (
    <Section title="Forma">
      {el.shape === "divider" && (
        <Field label="Título de la sección">
          <TextField value={el.title} onChange={(v) => up({ title: v }, "title")} />
        </Field>
      )}
      <ColorField label="Trazo" value={el.stroke} onChange={(v) => up({ stroke: v ?? "#374151" }, "stroke")} />
      <NumberField label="Grosor del trazo" unit="pt" value={el.strokeWidth} min={0} max={20} step={0.25} onChange={(v) => up({ strokeWidth: v }, "sw")} />
      <Segmented
        value={el.dash}
        onChange={(v) => up({ dash: v })}
        options={[
          { value: "solid", label: "Continuo" },
          { value: "dashed", label: "Discontinuo" },
          { value: "dotted", label: "Punteado" },
        ]}
      />
      {(el.shape === "rect" || el.shape === "ellipse") && <ColorField label="Relleno" value={el.fill} allowNone onChange={(v) => up({ fill: v }, "fill")} />}
      {el.shape === "rect" && <NumberField label="Esquinas" unit="mm" value={el.radius} min={0} max={50} step={0.5} onChange={(v) => up({ radius: v }, "r")} />}
    </Section>
  );
}

function HeaderProps({ el, fitHeight }: { el: ExamHeaderElement; fitHeight: () => void }) {
  const st = useEditor.getState();
  const up = (patch: Partial<ExamHeaderElement>) => st.updateElement<ExamHeaderElement>(el.id, patch);
  return (
    <Section title="Cabecera">
      <Segmented
        value={el.variant}
        onChange={(v) => up({ variant: v })}
        options={[
          { value: "boxed", label: "Con recuadro" },
          { value: "simple", label: "Sencilla" },
        ]}
      />
      <SwitchRow label="Nombre y apellidos" checked={el.showName} onChange={(v) => up({ showName: v })} />
      <SwitchRow label="Curso o grupo" checked={el.showCourse} onChange={(v) => up({ showCourse: v })} />
      <SwitchRow label="Fecha" checked={el.showDate} onChange={(v) => up({ showDate: v })} />
      <SwitchRow label="Casilla de nota" checked={el.showScore} onChange={(v) => up({ showScore: v })} />
      <SwitchRow label="Instrucciones" checked={el.showInstructions} onChange={(v) => up({ showInstructions: v })} />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => st.setLeftTab("document")}>
          <ArrowUpToLine /> Editar datos
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={fitHeight}>
          <ArrowDownToLine /> Ajustar alto
        </Button>
      </div>
    </Section>
  );
}
