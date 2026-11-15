"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FilePlus2,
  Hand,
  Loader2,
  Maximize,
  Plus,
  Scissors,
  SquareDashedMousePointer,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState, Separator } from "@/components/ui/misc";
import { Tip } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CropPreview, RegionSelector, type Region } from "./region-selector";
import { useChoice } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { appendImageToProject, createSelection, deleteSelection, getComic, listProjects, listSelections, updateSelection } from "@/lib/local/repo";
import { pageImageUrl } from "@/lib/images/urls";
import { FULL_RECT, type NormRect } from "@/lib/regions/coords";
import { pageToSource, selectionToSource, type ComicDetail, type ProjectSummaryDTO, type SavedSelection } from "@/lib/client-types";
import type { ImageSource } from "@/lib/document/types";

export type InsertLayout = "auto" | "row" | "perPage";

/** Control del visor desde fuera (p. ej. el diálogo del editor, para no perder borradores al cerrarlo). */
export interface ComicViewerHandle {
  /** Número de viñetas dibujadas que aún no se han guardado. */
  draftCount: () => number;
  /** Guarda todos los borradores en la biblioteca. Devuelve cuántos se guardaron. */
  saveAllDrafts: () => Promise<number>;
  /** Si hay una viñeta seleccionada, la deselecciona y devuelve true (Esc no debe cerrar el visor). */
  consumeEscape: () => boolean;
  /** Pregunta qué hacer con los borradores. Devuelve false si el usuario decide quedarse. */
  confirmLeave: () => Promise<boolean>;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

export function ComicViewer({
  comicId,
  mode,
  initialPage = 0,
  onInsert,
  ref,
}: {
  comicId: string;
  mode: "library" | "editor";
  initialPage?: number;
  onInsert?: (sources: ImageSource[], layout: InsertLayout) => void;
  ref?: Ref<ComicViewerHandle>;
}) {
  const router = useRouter();
  const choose = useChoice();
  const [comic, setComic] = useState<ComicDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [checkedPages, setCheckedPages] = useState<Set<number>>(new Set());
  const lastChecked = useRef<number | null>(null);
  const [saved, setSaved] = useState<SavedSelection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Region[]>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [checkedRegions, setCheckedRegions] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const draftCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, sels] = await Promise.all([getComic(comicId), listSelections({ comicId })]);
        if (cancelled) return;
        if (!c) throw new Error("Este cómic no existe en este navegador. Puede que se haya borrado.");
        setComic(c);
        setSaved(sels);
        setPageIdx((i) => Math.min(Math.max(0, i), Math.max(0, c.pages.length - 1)));
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [comicId]);

  const page = comic?.pages[pageIdx];
  const pageCount = comic?.pages.length ?? 0;

  /* ----------------------------- Regiones ----------------------------- */

  const regions: Region[] = useMemo(() => {
    if (!page) return [];
    const s = saved
      .filter((x) => x.pageId === page.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((x) => ({ key: `s:${x.id}`, rect: x.rect, label: x.label, saved: true }));
    return [...s, ...(drafts[page.id] ?? [])];
  }, [saved, drafts, page]);

  const setRegionRect = (key: string, rect: NormRect) => {
    if (!page) return;
    if (key.startsWith("s:")) {
      const id = key.slice(2);
      setSaved((ss) => ss.map((x) => (x.id === id ? { ...x, rect } : x)));
    } else {
      setDrafts((d) => ({ ...d, [page.id]: (d[page.id] ?? []).map((r) => (r.key === key ? { ...r, rect } : r)) }));
    }
  };

  const commitRegion = async (key: string, rect: NormRect) => {
    if (!key.startsWith("s:")) return;
    try {
      const updated = await updateSelection(key.slice(2), { rect });
      setSaved((ss) => ss.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      toast.error("No se ha podido actualizar la viñeta", { description: (err as Error).message });
    }
  };

  const createDraft = (rect: NormRect) => {
    if (!page) return;
    const key = `d:${++draftCounter.current}`;
    const n = regions.length + 1;
    setDrafts((d) => ({ ...d, [page.id]: [...(d[page.id] ?? []), { key, rect, label: `Pág. ${page.index + 1} · viñeta ${n}`, saved: false }] }));
    setActiveKey(key);
  };

  /** Guarda un borrador en la biblioteca y devuelve la selección guardada. */
  const ensureSaved = async (key: string): Promise<SavedSelection | null> => {
    if (!page) return null;
    if (key.startsWith("s:")) return saved.find((x) => x.id === key.slice(2)) ?? null;
    const region = (drafts[page.id] ?? []).find((r) => r.key === key);
    if (!region) return null;
    const sel = await createSelection({ pageId: page.id, rect: region.rect, label: region.label });
    setSaved((ss) => [...ss, sel]);
    setDrafts((d) => ({ ...d, [page.id]: (d[page.id] ?? []).filter((r) => r.key !== key) }));
    const newKey = `s:${sel.id}`;
    setActiveKey((k) => (k === key ? newKey : k));
    setCheckedRegions((c) => {
      if (!c.has(key)) return c;
      const n = new Set(c);
      n.delete(key);
      n.add(newKey);
      return n;
    });
    return sel;
  };

  const saveRegion = async (key: string) => {
    try {
      setBusy(true);
      await ensureSaved(key);
      toast.success("Viñeta guardada en la biblioteca");
    } catch (err) {
      toast.error("No se ha podido guardar la viñeta", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const deleteRegion = async (key: string) => {
    if (!page) return;
    if (key.startsWith("d:")) {
      setDrafts((d) => ({ ...d, [page.id]: (d[page.id] ?? []).filter((r) => r.key !== key) }));
    } else {
      const removed = saved.find((x) => x.id === key.slice(2));
      try {
        await deleteSelection(key.slice(2));
        setSaved((ss) => ss.filter((x) => x.id !== key.slice(2)));
        // Se puede recuperar durante unos segundos (se vuelve a crear con la misma región y nombre).
        toast.success("Viñeta eliminada de la biblioteca", {
          duration: 8000,
          action: removed
            ? {
                label: "Deshacer",
                onClick: async () => {
                  try {
                    const restored = await createSelection({ pageId: removed.pageId, rect: removed.rect, label: removed.label });
                    setSaved((ss) => [...ss, restored]);
                  } catch (err) {
                    toast.error("No se ha podido recuperar la viñeta", { description: (err as Error).message });
                  }
                },
              }
            : undefined,
        });
      } catch (err) {
        toast.error((err as Error).message);
        return;
      }
    }
    if (activeKey === key) setActiveKey(null);
  };

  /* ----------------------------- Borradores sin guardar ----------------------------- */

  const draftCount = Object.values(drafts).reduce((n, list) => n + list.length, 0);

  const saveAllDrafts = useCallback(async (): Promise<number> => {
    let n = 0;
    for (const [pageId, list] of Object.entries(drafts)) {
      for (const r of list) {
        const sel = await createSelection({ pageId, rect: r.rect, label: r.label });
        setSaved((ss) => [...ss, sel]);
        n++;
      }
    }
    setDrafts({});
    setCheckedRegions(new Set());
    setActiveKey((k) => (k?.startsWith("d:") ? null : k));
    return n;
  }, [drafts]);

  /** Pregunta qué hacer con los borradores antes de salir. Devuelve false si el usuario se queda. */
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    if (draftCount === 0) return true;
    const choice = await choose({
      title: draftCount === 1 ? "Tienes 1 viñeta sin guardar" : `Tienes ${draftCount} viñetas sin guardar`,
      description: "Si sales sin guardarlas, se perderán. Las viñetas guardadas aparecen en la pestaña «Viñetas» del editor.",
      options: [
        { value: "save", label: "Guardar y salir" },
        { value: "discard", label: "Salir sin guardar", variant: "outline" },
      ],
      cancelLabel: "Seguir seleccionando",
    });
    if (choice === null) return false;
    if (choice === "save") {
      try {
        const n = await saveAllDrafts();
        toast.success(n === 1 ? "Viñeta guardada en la biblioteca" : `${n} viñetas guardadas en la biblioteca`);
      } catch (err) {
        toast.error("No se han podido guardar las viñetas", { description: (err as Error).message });
        return false;
      }
    }
    return true;
  }, [draftCount, choose, saveAllDrafts]);

  useImperativeHandle(
    ref,
    () => ({
      draftCount: () => draftCount,
      saveAllDrafts,
      consumeEscape: () => {
        if (!activeKey) return false;
        setActiveKey(null);
        return true;
      },
      confirmLeave,
    }),
    [draftCount, saveAllDrafts, activeKey, confirmLeave],
  );

  // En la página del visor: proteger los enlaces internos y el cierre de la pestaña.
  useEffect(() => {
    if (mode !== "library" || draftCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || e.metaKey || e.ctrlKey) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmLeave().then((ok) => ok && router.push(url.pathname + url.search));
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [mode, draftCount, confirmLeave, router]);

  const renameRegion = (key: string, label: string) => {
    if (!page) return;
    if (key.startsWith("d:")) {
      setDrafts((d) => ({ ...d, [page.id]: (d[page.id] ?? []).map((r) => (r.key === key ? { ...r, label } : r)) }));
    } else {
      setSaved((ss) => ss.map((x) => (x.id === key.slice(2) ? { ...x, label } : x)));
    }
  };
  const commitLabel = async (key: string, label: string) => {
    if (!key.startsWith("s:")) return;
    await updateSelection(key.slice(2), { label }).catch(() => undefined);
  };

  /* ----------------------------- Inserción ----------------------------- */

  const [projects, setProjects] = useState<ProjectSummaryDTO[] | null>(null);
  const loadProjects = async () => {
    if (projects) return;
    try {
      setProjects(await listProjects());
    } catch {
      setProjects([]);
    }
  };

  const deliver = async (sources: ImageSource[], layout: InsertLayout, projectId?: string) => {
    if (sources.length === 0) return;
    if (mode === "editor" && onInsert) {
      onInsert(sources, layout);
      return;
    }
    if (!projectId) return;
    try {
      setBusy(true);
      for (const s of sources) {
        await appendImageToProject(projectId, s);
      }
      toast.success(sources.length === 1 ? "Imagen añadida al examen" : `${sources.length} imágenes añadidas al examen`, {
        action: { label: "Abrir examen", onClick: () => router.push(`/editor?id=${projectId}`) },
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const regionSources = async (keys: string[]): Promise<ImageSource[]> => {
    const out: ImageSource[] = [];
    for (const k of keys) {
      const sel = await ensureSaved(k);
      if (sel) out.push(selectionToSource(sel));
    }
    return out;
  };

  const insertRegions = async (keys: string[], layout: InsertLayout, projectId?: string) => {
    try {
      setBusy(true);
      const sources = await regionSources(keys);
      await deliver(sources, layout, projectId);
      setCheckedRegions(new Set());
    } catch (err) {
      toast.error("No se ha podido añadir la viñeta", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const pageSources = (indices: number[]) => (comic ? indices.map((i) => pageToSource(comic, comic.pages[i], FULL_RECT)) : []);

  /** Botón de inserción: directo en el editor, con selector de examen en la biblioteca. */
  const insertButton = ({
    label,
    run,
    variant = "default",
    icon,
    testId,
  }: {
    label: string;
    run: (projectId?: string) => void;
    variant?: "default" | "outline" | "secondary";
    icon: React.ReactNode;
    testId?: string;
  }) =>
    mode === "editor" ? (
      <Button size="sm" variant={variant} disabled={busy} onClick={() => run()} data-testid={testId}>
        {icon} {label}
      </Button>
    ) : (
      <DropdownMenu onOpenChange={(o) => o && loadProjects()}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant={variant} disabled={busy} data-testid={testId}>
            {icon} {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
          <DropdownMenuLabel>Añadir al examen…</DropdownMenuLabel>
          {projects === null ? (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando…
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">No hay exámenes. Crea uno desde el inicio.</div>
          ) : (
            projects.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => run(p.id)}>
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  /* ----------------------------- Navegación y zoom ----------------------------- */

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStageSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [comic]);

  const aspect = page ? page.width / page.height : 2 / 3;
  const fitWidth = Math.max(100, Math.min(stageSize.w - 48, (stageSize.h - 48) * aspect));
  const displayW = fitWidth * zoom;
  const displayH = displayW / aspect;
  const useOriginal = page ? displayW * (typeof window !== "undefined" ? window.devicePixelRatio : 1) > 1800 && page.width > 1800 : false;
  const imgUrl = page ? pageImageUrl(page.id, useOriginal ? "original" : "preview") : "";

  const goTo = useCallback(
    (i: number) => {
      setPageIdx(Math.min(Math.max(0, i), pageCount - 1));
      setActiveKey(null);
      setCheckedRegions(new Set());
    },
    [pageCount],
  );

  const changeZoom = (dir: 1 | -1) =>
    setZoom((z) => {
      const idx = ZOOMS.findIndex((v) => v >= z - 0.001);
      const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (idx === -1 ? ZOOMS.length - 1 : idx) + dir))];
      return next;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(pageIdx + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(pageIdx - 1);
      else if ((e.key === "Delete" || e.key === "Backspace") && activeKey?.startsWith("d:")) void deleteRegion(activeKey);
      else if (e.key === "Escape") setActiveKey(null);
      else if (e.key === "+" || e.key === "=") changeZoom(1);
      else if (e.key === "-") changeZoom(-1);
      else if (e.key.toLowerCase() === "v") setTool("select");
      else if (e.key.toLowerCase() === "h") setTool("pan");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo, pageIdx, activeKey]);

  // Zoom con Ctrl + rueda
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [comic]);

  // Desplazamiento con la herramienta "mano"
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  // Mantiene visible la miniatura de la página actual
  const thumbsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thumbsRef.current?.querySelector(`[data-page-index="${pageIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [pageIdx, comic]);

  const toggleCheck = (i: number, e: React.MouseEvent | React.ChangeEvent) => {
    const shift = "shiftKey" in e && (e as React.MouseEvent).shiftKey;
    setCheckedPages((prev) => {
      const next = new Set(prev);
      if (shift && lastChecked.current !== null) {
        const [a, b] = [Math.min(lastChecked.current, i), Math.max(lastChecked.current, i)];
        for (let k = a; k <= b; k++) next.add(k);
      } else if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    lastChecked.current = i;
  };

  const [rangeText, setRangeText] = useState("");
  const applyRange = () => {
    // Formato "3-7, 10, 12-14"
    const next = new Set<number>();
    for (const part of rangeText.split(",")) {
      const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) if (k >= 1 && k <= pageCount) next.add(k - 1);
    }
    setCheckedPages(next);
    if (next.size === 0) toast.error("Rango no válido", { description: "Usa el formato 3-7, 10, 12-14" });
  };

  /* ----------------------------- Render ----------------------------- */

  if (loadError) return <EmptyState icon={<Scissors />} title="No se ha podido abrir el cómic" description={loadError} className="m-8" />;
  if (!comic || !page) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Cargando cómic…
      </div>
    );
  }

  const active = regions.find((r) => r.key === activeKey) ?? null;
  const checkedList = [...checkedPages].sort((a, b) => a - b);

  return (
    <div className="flex h-full min-h-0 w-full bg-background" data-testid="comic-viewer">
      {/* ---------- Miniaturas ---------- */}
      <aside className="flex w-44 shrink-0 flex-col border-r bg-card xl:w-52">
        <div className="space-y-2 border-b p-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold">Páginas ({pageCount})</span>
            {checkedPages.size > 0 && (
              <button className="text-[11px] text-primary hover:underline" onClick={() => setCheckedPages(new Set())}>
                Quitar selección
              </button>
            )}
          </div>
          <div className="flex gap-1">
            <Input
              value={rangeText}
              onChange={(e) => setRangeText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyRange()}
              placeholder="Rango: 3-7, 10"
              className="h-7 px-2 text-xs"
              aria-label="Seleccionar rango de páginas"
            />
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={applyRange}>
              OK
            </Button>
          </div>
        </div>
        <div ref={thumbsRef} className="thin-scroll flex-1 space-y-2 overflow-y-auto p-2">
          {comic.pages.map((p, i) => {
            const hasSel = saved.some((s) => s.pageId === p.id);
            return (
              <div
                key={p.id}
                data-page-index={i}
                className={cn(
                  "group relative cursor-pointer overflow-hidden rounded-md border-2 bg-muted transition-colors",
                  i === pageIdx ? "border-primary" : "border-transparent hover:border-primary/40",
                  checkedPages.has(i) && "ring-2 ring-comic ring-offset-1",
                )}
                onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggleCheck(i, e) : goTo(i))}
                draggable={mode === "editor"}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-comicexam-image", JSON.stringify(pageToSource(comic, p)));
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pageImageUrl(p.id, "thumb")} alt={`Página ${i + 1}`} loading="lazy" className="w-full" style={{ aspectRatio: `${p.width}/${p.height}` }} />
                <span className="absolute bottom-1 left-1 rounded bg-slate-900/75 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                {hasSel && (
                  <span className="absolute right-1 bottom-1 rounded bg-emerald-500 p-0.5 text-white" title="Tiene viñetas guardadas">
                    <Scissors className="size-2.5" />
                  </span>
                )}
                <input
                  type="checkbox"
                  className={cn("absolute top-1 right-1 size-4 accent-amber-500", !checkedPages.has(i) && "opacity-0 group-hover:opacity-100")}
                  checked={checkedPages.has(i)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => toggleCheck(i, e)}
                  aria-label={`Seleccionar página ${i + 1}`}
                />
              </div>
            );
          })}
        </div>
        {checkedPages.size > 0 && (
          <div className="space-y-2 border-t p-2">
            <p className="text-xs text-muted-foreground">
              {checkedPages.size} página{checkedPages.size > 1 ? "s" : ""} seleccionada{checkedPages.size > 1 ? "s" : ""}
            </p>
            {insertButton({
              label: "Añadir al examen",
              icon: <FilePlus2 />,
              run: (pid) => deliver(pageSources(checkedList), "perPage", pid),
            })}
          </div>
        )}
      </aside>

      {/* ---------- Visor ---------- */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b bg-card px-3 py-1.5">
          <Tip label="Página anterior (←)">
            <Button variant="ghost" size="icon" onClick={() => goTo(pageIdx - 1)} disabled={pageIdx === 0} aria-label="Página anterior">
              <ChevronLeft />
            </Button>
          </Tip>
          <div className="flex items-center gap-1 text-sm">
            <Input
              key={pageIdx}
              defaultValue={pageIdx + 1}
              className="h-8 w-14 text-center"
              aria-label="Número de página"
              onKeyDown={(e) => {
                if (e.key === "Enter") goTo(Number((e.target as HTMLInputElement).value) - 1);
              }}
              onBlur={(e) => goTo(Number(e.target.value) - 1)}
            />
            <span className="text-muted-foreground">/ {pageCount}</span>
          </div>
          <Tip label="Página siguiente (→)">
            <Button variant="ghost" size="icon" onClick={() => goTo(pageIdx + 1)} disabled={pageIdx >= pageCount - 1} aria-label="Página siguiente">
              <ChevronRight />
            </Button>
          </Tip>
          <Separator vertical />
          <Tip label="Seleccionar viñeta (V)">
            <Button
              variant={tool === "select" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTool("select")}
              data-testid="tool-select-panel"
              className={cn(tool === "select" && "ring-1 ring-primary/30")}
            >
              <SquareDashedMousePointer /> Seleccionar viñeta
            </Button>
          </Tip>
          <Tip label="Mover la vista (H)">
            <Button variant={tool === "pan" ? "secondary" : "ghost"} size="icon" onClick={() => setTool("pan")} aria-label="Mover la vista">
              <Hand />
            </Button>
          </Tip>
          <Separator vertical />
          <Tip label="Alejar (−)">
            <Button variant="ghost" size="icon" onClick={() => changeZoom(-1)} aria-label="Alejar">
              <ZoomOut />
            </Button>
          </Tip>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)} %</span>
          <Tip label="Acercar (+)">
            <Button variant="ghost" size="icon" onClick={() => changeZoom(1)} aria-label="Acercar">
              <ZoomIn />
            </Button>
          </Tip>
          <Tip label="Ajustar a la ventana">
            <Button variant="ghost" size="icon" onClick={() => setZoom(1)} aria-label="Ajustar a la ventana">
              <Maximize />
            </Button>
          </Tip>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground lg:inline">
              {page.width}×{page.height} px
            </span>
            {insertButton({
              label: "Página completa",
              variant: "outline",
              icon: <Plus />,
              testId: "insert-full-page",
              run: (pid) => deliver(pageSources([pageIdx]), "auto", pid),
            })}
          </div>
        </div>

        <div
          ref={stageRef}
          className={cn("thin-scroll relative flex-1 overflow-auto bg-canvas", tool === "pan" && "cursor-grab active:cursor-grabbing")}
          onPointerDown={(e) => {
            if (tool !== "pan") return;
            const el = stageRef.current!;
            pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
            el.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!pan.current) return;
            const el = stageRef.current!;
            el.scrollLeft = pan.current.sl - (e.clientX - pan.current.x);
            el.scrollTop = pan.current.st - (e.clientY - pan.current.y);
          }}
          onPointerUp={() => (pan.current = null)}
        >
          <div className="flex min-h-full min-w-full items-center justify-center p-6" style={{ width: displayW + 48, height: displayH + 48 }}>
            <div className="relative shrink-0 bg-white shadow-xl" style={{ width: displayW, height: displayH }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl} alt={`Página ${pageIdx + 1}`} className="pointer-events-none size-full select-none" draggable={false} />
              <div className={cn("absolute inset-0", tool === "pan" && "pointer-events-none")}>
                <RegionSelector
                  regions={regions}
                  activeKey={activeKey}
                  drawEnabled={tool === "select"}
                  onSelect={setActiveKey}
                  onCreate={createDraft}
                  onChange={setRegionRect}
                  onCommit={commitRegion}
                />
              </div>
            </div>
          </div>
          {regions.length === 0 && tool === "select" && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs text-white shadow">
              Dibuja un rectángulo sobre una viñeta para seleccionarla
            </div>
          )}
        </div>
      </section>

      {/* ---------- Viñetas de la página ---------- */}
      <aside className="flex w-72 shrink-0 flex-col border-l bg-card xl:w-80">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">Viñetas de la página {pageIdx + 1}</p>
            <p className="text-[11px] text-muted-foreground">
              {regions.filter((r) => r.saved).length} guardadas · {regions.filter((r) => !r.saved).length} sin guardar
            </p>
          </div>
          {draftCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              data-testid="save-all-drafts"
              onClick={async () => {
                try {
                  setBusy(true);
                  const n = await saveAllDrafts();
                  toast.success(n === 1 ? "Viñeta guardada en la biblioteca" : `${n} viñetas guardadas en la biblioteca`);
                } catch (err) {
                  toast.error("No se han podido guardar las viñetas", { description: (err as Error).message });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <BookmarkPlus /> Guardar {draftCount > 1 ? `todas (${draftCount})` : "borrador"}
            </Button>
          )}
        </div>
        <div className="thin-scroll flex-1 space-y-3 overflow-y-auto p-3">
          {regions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              <Scissors className="mx-auto mb-2 size-5" />
              Activa <strong>Seleccionar viñeta</strong> y arrastra el ratón sobre la página. Puedes hacer varias selecciones, moverlas y ajustar sus bordes.
            </div>
          ) : (
            regions.map((r, i) => (
              <div
                key={r.key}
                className={cn("rounded-lg border bg-background p-2 transition-colors", r.key === activeKey && "border-primary ring-2 ring-primary/20")}
                onClick={() => setActiveKey(r.key)}
                data-testid="region-card"
              >
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-indigo-600"
                    checked={checkedRegions.has(r.key)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() =>
                      setCheckedRegions((c) => {
                        const n = new Set(c);
                        if (n.has(r.key)) n.delete(r.key);
                        else n.add(r.key);
                        return n;
                      })
                    }
                    aria-label={`Marcar viñeta ${i + 1}`}
                  />
                  <span className={cn("flex size-5 items-center justify-center rounded text-[11px] font-bold text-white", r.saved ? "bg-emerald-500" : "bg-amber-500")}>{i + 1}</span>
                  <input
                    className="min-w-0 flex-1 rounded border-transparent bg-transparent px-1 text-xs font-medium outline-none hover:border-input focus:border-input focus:bg-card"
                    value={r.label}
                    onChange={(e) => renameRegion(r.key, e.target.value)}
                    onBlur={(e) => commitLabel(r.key, e.target.value)}
                    aria-label="Nombre de la viñeta"
                  />
                  <Badge variant={r.saved ? "success" : "warning"}>{r.saved ? "Guardada" : "Borrador"}</Badge>
                </div>
                <div className="checker overflow-hidden rounded border">
                  <CropPreview imageUrl={pageImageUrl(page.id, "preview")} rect={r.rect} pageWidth={page.width} pageHeight={page.height} />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                  {Math.round(r.rect.w * page.width)}×{Math.round(r.rect.h * page.height)} px originales
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {insertButton({
                    label: "Añadir al examen",
                    icon: <FilePlus2 />,
                    testId: "insert-region",
                    run: (pid) => insertRegions([r.key], "auto", pid),
                  })}
                  {!r.saved && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => saveRegion(r.key)} data-testid="save-region">
                      <BookmarkPlus /> Guardar en biblioteca
                    </Button>
                  )}
                  <Tip label={r.saved ? "Eliminar de la biblioteca" : "Descartar"}>
                    <Button size="iconSm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => deleteRegion(r.key)} aria-label="Eliminar viñeta">
                      <Trash2 />
                    </Button>
                  </Tip>
                </div>
              </div>
            ))
          )}
        </div>
        {checkedRegions.size >= 2 && (
          <div className="space-y-2 border-t bg-secondary/50 p-3">
            <p className="text-xs font-medium">{checkedRegions.size} viñetas marcadas</p>
            {insertButton({
              label: "Añadir una junto a otra",
              icon: <Columns2 />,
              testId: "insert-row",
              run: (pid) => insertRegions([...checkedRegions], "row", pid),
            })}
          </div>
        )}
        {active && (
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
            x {(active.rect.x * 100).toFixed(1)} % · y {(active.rect.y * 100).toFixed(1)} % · {(active.rect.w * 100).toFixed(1)} × {(active.rect.h * 100).toFixed(1)} %
          </div>
        )}
        {mode === "library" && (
          <div className="border-t p-3 text-[11px] text-muted-foreground">
            <Check className="mr-1 inline size-3" />
            Las viñetas guardadas aparecen en el editor, en la pestaña <strong>Viñetas</strong>.{" "}
            <Link href="/" className="text-primary hover:underline">
              Ir a mis exámenes
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
