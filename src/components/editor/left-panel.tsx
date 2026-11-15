"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  BookImage,
  CheckSquare,
  Circle,
  Columns2,
  FileText,
  Grid3x3,
  Heading1,
  Heading2,
  ImageIcon,
  ImageUp,
  Link2,
  ListChecks,
  Loader2,
  Minus,
  MessageSquareText,
  NotebookPen,
  PanelTop,
  RectangleHorizontal,
  Rows3,
  Scissors,
  Search,
  Settings2,
  Shapes,
  SquareDashed,
  Sparkles,
  StickyNote,
  Table,
  TextCursorInput,
  Type,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useEditor, type LeftTab } from "@/store/editor-store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Tip } from "@/components/ui/tooltip";
import { ComicViewer, type ComicViewerHandle, type InsertLayout } from "@/components/comics/comic-viewer";
import { ImportDropzone, ImportTasks } from "@/components/comics/import-dropzone";
import { useComics } from "@/components/comics/library-view";
import { useComicImport } from "@/hooks/use-comic-import";
import { DocumentSettings } from "./document-settings";
import { cn } from "@/lib/utils";
import { getComic, listSelections, onDataChange } from "@/lib/local/repo";
import { cropUrl, pageImageUrl } from "@/lib/images/urls";
import { createFromTemplate, DND_IMAGE, DND_TEMPLATE, type ElementTemplate } from "@/lib/document/templates";
import { pageToSource, selectionToSource, type ComicDetail, type ComicSummary, type SavedSelection } from "@/lib/client-types";
import type { ImageSource } from "@/lib/document/types";

const TABS: { id: LeftTab; label: string; icon: LucideIcon }[] = [
  { id: "comics", label: "Cómics", icon: BookImage },
  { id: "panels", label: "Viñetas", icon: Scissors },
  { id: "text", label: "Texto", icon: Type },
  { id: "questions", label: "Preguntas", icon: MessageSquareText },
  { id: "answers", label: "Respuestas", icon: NotebookPen },
  { id: "shapes", label: "Formas", icon: Shapes },
  { id: "uploads", label: "Imágenes", icon: ImageUp },
  { id: "document", label: "Documento", icon: Settings2 },
];

/** Eventos para refrescar listas cuando cambian las viñetas en el visor. */
const SELECTIONS_CHANGED = "comicexam:selections-changed";

export function LeftPanel() {
  const tab = useEditor((s) => s.leftTab);
  const [viewer, setViewer] = useState<{ comicId: string; page: number } | null>(null);

  const viewerRef = useRef<ComicViewerHandle>(null);

  /** Cierra el visor sin perder viñetas: si hay borradores, pregunta qué hacer con ellos. */
  const closeViewer = useCallback(async (): Promise<boolean> => {
    const ok = (await viewerRef.current?.confirmLeave()) ?? true;
    if (!ok) return false;
    setViewer(null);
    window.dispatchEvent(new Event(SELECTIONS_CHANGED));
    return true;
  }, []);

  const onInsert = useCallback(
    (sources: ImageSource[], layout: InsertLayout) => {
      const st = useEditor.getState();
      st.insertImages(sources, layout);
      const after = useEditor.getState();
      const ids = after.lastInserted?.ids ?? [];
      const pageIdx = after.doc.pages.findIndex((p) => p.id === after.activePageId);
      toast.success(sources.length === 1 ? "Imagen añadida al examen" : `${sources.length} imágenes añadidas`, {
        description: `En la hoja ${pageIdx + 1}. Puedes seguir seleccionando viñetas.`,
        action: {
          label: "Ver en el examen",
          onClick: async () => {
            if (await closeViewer()) useEditor.getState().reveal(ids);
          },
        },
      });
    },
    [closeViewer],
  );

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r bg-card py-2" aria-label="Herramientas">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => useEditor.getState().setLeftTab(t.id)}
            data-testid={`left-tab-${t.id}`}
            className={cn(
              "flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs font-medium text-muted-foreground transition-[color,background-color,translate,scale] hover:bg-muted hover:text-foreground motion-safe:active:scale-[0.95]",
              tab === t.id && "bg-secondary text-secondary-foreground hover:bg-secondary",
            )}
          >
            <t.icon className="size-5" />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="thin-scroll flex w-[272px] min-h-0 flex-col overflow-y-auto border-r bg-card">
        {tab === "comics" && <ComicsTab onOpen={(comicId, page) => setViewer({ comicId, page })} />}
        {tab === "panels" && <PanelsTab />}
        {tab === "text" && <TemplatesTab title="Texto" items={TEXT_ITEMS} />}
        {tab === "questions" && <TemplatesTab title="Preguntas" items={QUESTION_ITEMS} hint="Las preguntas se numeran solas según su posición. Puedes fijar un número manual en Propiedades." />}
        {tab === "answers" && <TemplatesTab title="Espacios de respuesta" items={ANSWER_ITEMS} />}
        {tab === "shapes" && <TemplatesTab title="Formas y separadores" items={SHAPE_ITEMS} />}
        {tab === "uploads" && <UploadsTab />}
        {tab === "document" && <DocumentSettings />}
      </div>

      <Dialog
        open={!!viewer}
        onOpenChange={(o) => {
          if (!o) void closeViewer();
        }}
      >
        <DialogContent
          className="flex h-[94vh] max-w-[97vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[97vw]"
          aria-describedby={undefined}
          // Esc primero deselecciona la viñeta activa; solo cierra si no hay ninguna seleccionada.
          onEscapeKeyDown={(e) => {
            if (viewerRef.current?.consumeEscape()) e.preventDefault();
          }}
          // Un clic fuera no cierra el visor (se perdería el trabajo por accidente).
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogTitle className="border-b px-4 py-3 pr-12 text-sm">Visor de cómics · selecciona viñetas y añádelas a la hoja que estás viendo</DialogTitle>
          <div className="min-h-0 flex-1">
            {viewer && <ComicViewer ref={viewerRef} comicId={viewer.comicId} mode="editor" initialPage={viewer.page} onInsert={onInsert} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 material px-4 py-3 shadow-[0_1px_0_var(--material-edge)]">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

/* ------------------------------- Cómics ------------------------------- */

function ComicsTab({ onOpen }: { onOpen: (comicId: string, page: number) => void }) {
  const { comics, reload } = useComics();
  const { tasks, importFiles, dismiss } = useComicImport(() => void reload());
  const [openComic, setOpenComic] = useState<ComicSummary | null>(null);
  const [loaded, setLoaded] = useState<ComicDetail | null>(null);
  const detail = loaded && loaded.id === openComic?.id ? loaded : null;
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!openComic) return;
    let cancelled = false;
    getComic(openComic.id)
      .then((d) => !cancelled && setLoaded(d))
      .catch((e) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [openComic]);

  if (openComic) {
    return (
      <div className="flex min-h-0 flex-col">
        <PanelHeader title={openComic.title}>
          <Button variant="ghost" size="iconSm" onClick={() => setOpenComic(null)} aria-label="Volver">
            <ArrowLeft />
          </Button>
        </PanelHeader>
        <div className="space-y-3 p-3">
          <Button className="w-full" onClick={() => onOpen(openComic.id, 0)} data-testid="open-viewer">
            <Scissors /> Abrir visor y seleccionar viñetas
          </Button>
          <p className="text-2xs leading-snug text-muted-foreground">
            Haz clic en una página para abrirla en el visor, o <strong>arrástrala</strong> a una hoja para insertarla completa.
          </p>
          {!detail ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {detail.pages.map((p, i) => (
                <button
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_IMAGE, JSON.stringify(pageToSource(detail, p)));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onOpen(openComic.id, i)}
                  className="group relative overflow-hidden rounded-md border bg-muted transition-all hover:border-primary hover:shadow"
                  data-testid="comic-page-thumb"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageImageUrl(p.id, "thumb")} alt={`Página ${i + 1}`} loading="lazy" className="w-full" style={{ aspectRatio: `${p.width}/${p.height}` }} draggable={false} />
                  <span className="absolute bottom-1 left-1 rounded bg-slate-900/75 px-1.5 text-2xs font-semibold text-white">{i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const list = (comics ?? []).filter((c) => c.format !== "images" && c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PanelHeader title="Cómics" />
      <div className="space-y-3 p-3">
        <ImportDropzone onFiles={importFiles} compact />
        <ImportTasks tasks={tasks} onDismiss={dismiss} />
        {(comics?.length ?? 0) > 4 && (
          <div className="relative">
            <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cómic…" className="h-8 pl-8" />
          </div>
        )}
        {comics === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Todavía no hay cómics. Importa un CBR o CBZ.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  disabled={c.status !== "ready"}
                  onClick={() => setOpenComic(c)}
                  className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40 disabled:opacity-60"
                  data-testid="editor-comic-item"
                >
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.coverPageId && <img src={pageImageUrl(c.coverPageId, "thumb")} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-2xs text-muted-foreground">
                      {c.status === "processing" ? `${c.stage} ${c.progress} %` : c.status === "error" ? "Error al importar" : `${c.pageCount} páginas`}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Viñetas ------------------------------- */

function PanelsTab() {
  const [items, setItems] = useState<SavedSelection[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const load = useCallback(() => {
    listSelections()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(SELECTIONS_CHANGED, load);
    const off = onDataChange("selections", load);
    return () => {
      window.removeEventListener(SELECTIONS_CHANGED, load);
      off();
    };
  }, [load]);

  const comics = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of items ?? []) m.set(s.comicId, s.comicTitle);
    return [...m];
  }, [items]);
  const list = (items ?? []).filter((s) => filter === "all" || s.comicId === filter).sort((a, b) => a.pageIndex - b.pageIndex || a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader title="Viñetas guardadas" />
      <div className="space-y-3 p-3">
        {items === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Scissors />}
            title="Sin viñetas todavía"
            description="Abre un cómic en la pestaña Cómics, selecciona viñetas y guárdalas en la biblioteca."
            className="px-3 py-8"
          />
        ) : (
          <>
            {comics.length > 1 && (
              <select className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">Todos los cómics</option>
                {comics.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            )}
            <p className="text-2xs text-muted-foreground">Haz clic para insertar o arrastra a una hoja. Marca varias para colocarlas una junto a otra.</p>
            {checked.size >= 2 && (
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  const sel = list.filter((s) => checked.has(s.id)).map(selectionToSource);
                  useEditor.getState().insertImages(sel, "row");
                  setChecked(new Set());
                }}
              >
                <Columns2 /> Insertar {checked.size} una junto a otra
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {list.map((s) => (
                <div key={s.id} className="group relative">
                  <button
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_IMAGE, JSON.stringify(selectionToSource(s)));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => useEditor.getState().insertImages([selectionToSource(s)], "auto")}
                    className="block w-full overflow-hidden rounded-md border bg-muted text-left transition-all hover:border-primary hover:shadow"
                    title={`${s.label} — ${s.comicTitle}`}
                    data-testid="saved-panel"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cropUrl(s.pageId, s.rect, "thumb")} alt={s.label} loading="lazy" className="max-h-36 w-full bg-white object-contain" draggable={false} />
                    <span className="block truncate px-1.5 py-1 text-2xs text-muted-foreground">{s.label}</span>
                  </button>
                  <input
                    type="checkbox"
                    className={cn("absolute top-1 right-1 size-4 accent-indigo-600", !checked.has(s.id) && "hover-reveal")}
                    checked={checked.has(s.id)}
                    onChange={() =>
                      setChecked((c) => {
                        const n = new Set(c);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      })
                    }
                    aria-label={`Marcar ${s.label}`}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Plantillas ------------------------------- */

interface TemplateItem {
  label: string;
  description?: string;
  icon: LucideIcon;
  template: ElementTemplate;
}

const TEXT_ITEMS: TemplateItem[] = [
  { label: "Cabecera del examen", description: "Título, nombre, nota e instrucciones", icon: PanelTop, template: { kind: "examHeader" } },
  { label: "Título", icon: Heading1, template: { kind: "text", preset: "title" } },
  { label: "Subtítulo", icon: Heading2, template: { kind: "text", preset: "subtitle" } },
  { label: "Párrafo", icon: AlignLeft, template: { kind: "text", preset: "paragraph" } },
  { label: "Instrucciones", description: "Recuadro con fondo gris", icon: FileText, template: { kind: "text", preset: "instructions" } },
  { label: "Nota destacada", icon: StickyNote, template: { kind: "text", preset: "note" } },
];

const QUESTION_ITEMS: TemplateItem[] = [
  { label: "Respuesta corta", description: "Una línea para responder", icon: TextCursorInput, template: { kind: "question", question: "short" } },
  { label: "Respuesta larga", description: "Varias líneas", icon: AlignLeft, template: { kind: "question", question: "long" } },
  { label: "Opción múltiple", description: "a), b), c)…", icon: ListChecks, template: { kind: "question", question: "multiple" } },
  { label: "Verdadero o falso", description: "Afirmaciones con V / F", icon: CheckSquare, template: { kind: "question", question: "truefalse" } },
  { label: "Relacionar conceptos", description: "Unir con flechas", icon: Link2, template: { kind: "question", question: "match" } },
  { label: "Pregunta sobre imagen", description: "Viñeta + líneas de respuesta", icon: ImageIcon, template: { kind: "question", question: "image" } },
];

const ANSWER_ITEMS: TemplateItem[] = [
  { label: "2 líneas", icon: Rows3, template: { kind: "lines", count: 2 } },
  { label: "4 líneas", icon: Rows3, template: { kind: "lines", count: 4 } },
  { label: "8 líneas", icon: Rows3, template: { kind: "lines", count: 8 } },
  { label: "Cuadro vacío", icon: SquareDashed, template: { kind: "box", variant: "box" } },
  { label: "Área de respuesta", description: "Con etiqueta «Respuesta:»", icon: RectangleHorizontal, template: { kind: "box", variant: "area" } },
  { label: "Cuadrícula", description: "Para dibujar o calcular", icon: Grid3x3, template: { kind: "box", variant: "grid" } },
  { label: "Tabla 3 × 3", icon: Table, template: { kind: "table", rows: 3, cols: 3 } },
  { label: "Tabla 4 × 2", icon: Table, template: { kind: "table", rows: 4, cols: 2 } },
];

const SHAPE_ITEMS: TemplateItem[] = [
  { label: "Separador de sección", icon: Sparkles, template: { kind: "shape", shape: "divider" } },
  { label: "Línea horizontal", icon: Minus, template: { kind: "shape", shape: "hline" } },
  { label: "Línea vertical", icon: Minus, template: { kind: "shape", shape: "vline" } },
  { label: "Rectángulo", icon: RectangleHorizontal, template: { kind: "shape", shape: "rect" } },
  { label: "Elipse", icon: Circle, template: { kind: "shape", shape: "ellipse" } },
];

function TemplatesTab({ title, items, hint }: { title: string; items: TemplateItem[]; hint?: string }) {
  return (
    <div>
      <PanelHeader title={title} />
      <div className="space-y-2 p-3">
        {items.map((it) => (
          <button
            key={it.label}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_TEMPLATE, JSON.stringify(it.template));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => useEditor.getState().addElement(createFromTemplate(it.template))}
            className="flex w-full items-center gap-3 rounded-lg border bg-background p-2.5 text-left transition-all hover:border-primary/50 hover:bg-secondary/40 hover:shadow-xs"
            data-testid={`tpl-${it.label}`}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <it.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{it.label}</span>
              {it.description && <span className="block text-2xs text-muted-foreground">{it.description}</span>}
            </span>
          </button>
        ))}
        {hint && <p className="pt-1 text-2xs leading-snug text-muted-foreground">{hint}</p>}
        <p className="pt-1 text-2xs text-muted-foreground">Clic para añadir a la hoja activa, o arrastra a cualquier hoja.</p>
      </div>
    </div>
  );
}

/* ------------------------------- Imágenes propias ------------------------------- */

function UploadsTab() {
  const { comics, reload } = useComics();
  const { tasks, importFiles, dismiss } = useComicImport(() => void reload());
  const [pages, setPages] = useState<{ comic: ComicDetail; page: ComicDetail["pages"][number] }[] | null>(null);
  const collections = useMemo(() => (comics ?? []).filter((c) => c.format === "images" && c.status === "ready"), [comics]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(collections.map((c) => getComic(c.id)))
      .then((ds) => !cancelled && setPages((ds.filter(Boolean) as ComicDetail[]).flatMap((d) => d.pages.map((p) => ({ comic: d, page: p })))))
      .catch(() => setPages([]));
    return () => {
      cancelled = true;
    };
  }, [collections]);
  return (
    <div>
      <PanelHeader title="Imágenes propias" />
      <div className="space-y-3 p-3">
        <ImportDropzone onFiles={(f) => importFiles(f)} compact />
        <ImportTasks tasks={tasks} onDismiss={dismiss} />
        {pages === null ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : pages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">Sube imágenes JPG, PNG o WebP para usarlas en tus exámenes.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {pages.map(({ comic, page }) => (
              <Tip key={page.id} label={page.entryName}>
                <button
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_IMAGE, JSON.stringify(pageToSource(comic, page)));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => useEditor.getState().insertImages([pageToSource(comic, page)], "auto")}
                  className="overflow-hidden rounded-md border bg-white hover:border-primary hover:shadow"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageImageUrl(page.id, "thumb")} alt={page.entryName} className="max-h-32 w-full object-contain" loading="lazy" draggable={false} />
                </button>
              </Tip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
