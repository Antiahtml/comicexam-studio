"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CloudOff,
  Copy,
  Download,
  Eye,
  FileDown,
  Grid2x2Check,
  Loader2,
  Magnet,
  MoreHorizontal,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/store/editor-store";
import type { ExamDocument } from "@/lib/document/types";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogoMark } from "@/components/layout/logo";
import { LeftPanel } from "./left-panel";
import { EditorCanvas } from "./editor-canvas";
import { PropertiesPanel } from "./properties-panel";
import { PageStrip } from "./page-strip";
import { animateZoomTo, zoomBy } from "./zoom-motion";
import { ExportPdfDialog } from "./export-dialog";
import { PX_PER_MM, pageSize } from "@/lib/document/units";
import { cn, downloadBlob, safeFileName } from "@/lib/utils";
import { duplicateProject, saveProject } from "@/lib/local/repo";
import { exportProjectBundle } from "@/lib/local/bundle";

/* ------------------------------- Autoguardado ------------------------------- */

async function saveNow(): Promise<boolean> {
  const st = useEditor.getState();
  if (!st.projectId) return true;
  const version = st.version;
  st.markSaving();
  try {
    await saveProject(st.projectId, { name: st.name, document: st.doc });
    useEditor.getState().markSaved(version);
    return true;
  } catch (err) {
    useEditor.getState().markSaveError((err as Error).message);
    return false;
  }
}

/** Guarda automáticamente 900 ms después del último cambio. */
function useAutosave() {
  const version = useEditor((s) => s.version);
  const savedVersion = useEditor((s) => s.savedVersion);
  const saving = useRef(false);
  useEffect(() => {
    if (version === savedVersion) return;
    const t = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      await saveNow();
      saving.current = false;
    }, 900);
    return () => clearTimeout(t);
  }, [version, savedVersion]);

  // Si se cierra la pestaña con cambios pendientes, se intenta guardar y se avisa.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const st = useEditor.getState();
      if (st.version === st.savedVersion) return;
      void saveNow();
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
}

function SaveIndicator() {
  const saveState = useEditor((s) => s.saveState);
  const saveError = useEditor((s) => s.saveError);
  const map = {
    saved: { icon: <Check className="size-3.5" />, text: "Guardado", cls: "text-emerald-700" },
    dirty: { icon: <span className="size-2 rounded-full bg-amber-500" />, text: "Cambios sin guardar", cls: "text-muted-foreground" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Guardando…", cls: "text-muted-foreground" },
    error: { icon: <CloudOff className="size-3.5" />, text: "Error al guardar", cls: "text-destructive" },
  }[saveState];
  return (
    <Tip label={saveState === "error" ? `${saveError ?? ""} · Pulsa para reintentar` : "Los cambios se guardan automáticamente"}>
      <button className={cn("flex items-center gap-1.5 rounded px-1.5 py-1 text-xs", map.cls)} onClick={() => void saveNow()} data-testid="save-indicator" data-state={saveState}>
        {map.icon}
        <span className="hidden md:inline">{map.text}</span>
      </button>
    </Tip>
  );
}

/* ------------------------------- Atajos de teclado ------------------------------- */

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable=true]");
      const mod = e.metaKey || e.ctrlKey;
      const st = useEditor.getState();
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow().then((ok) => ok && toast.success("Proyecto guardado"));
        return;
      }
      if (typing || document.querySelector("[role=dialog]")) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        st.duplicateSelected();
      } else if (mod && e.key.toLowerCase() === "c") {
        st.copySelected();
      } else if (mod && e.key.toLowerCase() === "x") {
        st.cutSelected();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        st.paste();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const page = st.doc.pages.find((p) => p.id === st.activePageId);
        st.select(page?.elements.map((x) => x.id) ?? []);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selectedIds.length) {
          e.preventDefault();
          st.deleteSelected();
        }
      } else if (e.key === "Escape") {
        st.select([]);
      } else if (e.key.startsWith("Arrow") && st.selectedIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        st.nudge(dx, dy);
      } else if (mod && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        zoomBy(1.15);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        zoomBy(1 / 1.15);
      } else if (e.key === "Enter" && st.selectedIds.length === 1) {
        st.setEditing(st.selectedIds[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/* ------------------------------- Barra superior ------------------------------- */

function ProjectName() {
  const name = useEditor((s) => s.name);
  return (
    <input
      value={name}
      onChange={(e) => useEditor.getState().setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
      aria-label="Nombre del proyecto"
      data-testid="project-name"
      className="h-8 w-full max-w-[22rem] min-w-0 truncate rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold outline-none hover:border-input focus:border-ring focus:bg-card"
    />
  );
}

function ZoomControls() {
  const zoom = useEditor((s) => s.zoom);
  const orientation = useEditor((s) => s.doc.settings.orientation);
  const fitWidth = () => {
    const canvas = document.querySelector<HTMLElement>("[data-testid=editor-canvas]");
    if (!canvas) return;
    const { width } = pageSize(orientation);
    animateZoomTo((canvas.clientWidth - 100) / (width * PX_PER_MM));
  };
  return (
    <div className="flex items-center gap-0.5">
      <Tip label="Alejar (⌘/Ctrl −)">
        <Button variant="ghost" size="iconSm" onClick={() => zoomBy(1 / 1.15)} aria-label="Alejar">
          <ZoomOut />
        </Button>
      </Tip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-14 rounded px-1 py-1 text-xs tabular-nums hover:bg-muted" data-testid="zoom-level">
            {Math.round(zoom * 100)} %
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-32">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => (
            <DropdownMenuItem key={z} onSelect={() => animateZoomTo(z)}>
              {z * 100} %
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={fitWidth}>Ajustar al ancho</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tip label="Acercar (⌘/Ctrl +)">
        <Button variant="ghost" size="iconSm" onClick={() => zoomBy(1.15)} aria-label="Acercar">
          <ZoomIn />
        </Button>
      </Tip>
    </div>
  );
}

function TopBar({ onExport }: { onExport: () => void }) {
  const router = useRouter();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const showGuides = useEditor((s) => s.showGuides);
  const snap = useEditor((s) => s.snap);
  const projectId = useEditor((s) => s.projectId);
  const st = useEditor.getState();

  const duplicate = async () => {
    await saveNow();
    try {
      const copy = await duplicateProject(projectId);
      toast.success("Proyecto duplicado");
      router.push(`/editor?id=${copy.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <header className="material absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-2 px-3 shadow-[0_1px_0_var(--material-edge)]">
      <Tip label="Volver a mis exámenes">
        <Link
          href="/"
          onClick={() => void saveNow()}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" />
          <LogoMark className="size-7" />
        </Link>
      </Tip>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <ProjectName />
        <SaveIndicator />
      </div>
      <div className="flex items-center gap-0.5">
        <Tip label="Deshacer (⌘/Ctrl Z)">
          <Button variant="ghost" size="iconSm" disabled={!canUndo} onClick={() => st.undo()} aria-label="Deshacer" data-testid="undo">
            <Undo2 />
          </Button>
        </Tip>
        <Tip label="Rehacer (⌘/Ctrl ⇧ Z)">
          <Button variant="ghost" size="iconSm" disabled={!canRedo} onClick={() => st.redo()} aria-label="Rehacer">
            <Redo2 />
          </Button>
        </Tip>
        <Separator vertical />
        <ZoomControls />
        <Separator vertical />
        <Tip label={showGuides ? "Ocultar márgenes y guías" : "Mostrar márgenes y guías"}>
          <Button variant={showGuides ? "secondary" : "ghost"} size="iconSm" onClick={() => st.toggleGuides()} aria-label="Guías">
            <Grid2x2Check />
          </Button>
        </Tip>
        <Tip label={snap ? "Ajuste magnético activado" : "Ajuste magnético desactivado"}>
          <Button variant={snap ? "secondary" : "ghost"} size="iconSm" onClick={() => st.toggleSnap()} aria-label="Ajuste magnético">
            <Magnet />
          </Button>
        </Tip>
      </div>
      <Separator vertical />
      <Button variant="outline" size="sm" asChild>
        <Link href={`/vista-previa?id=${projectId}`} onClick={() => void saveNow()} data-testid="preview-link">
          <Eye /> Vista previa
        </Link>
      </Button>
      <Button size="sm" onClick={onExport} data-testid="export-pdf">
        <FileDown /> Exportar PDF
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label="Más opciones">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              await saveNow();
              try {
                const bundle = await exportProjectBundle(projectId);
                downloadBlob(bundle.data, `${safeFileName(bundle.name)}.comicexam`, "application/zip");
              } catch (err) {
                toast.error("No se ha podido exportar", { description: (err as Error).message });
              }
            }}
          >
            <Download /> Exportar examen (.comicexam)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplicar examen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

/* ------------------------------- Editor ------------------------------- */

export function EditorShell({ project }: { project: { id: string; name: string; document: ExamDocument } }) {
  const ready = useEditor((s) => s.projectId === project.id);
  const [exportOpen, setExportOpen] = useState(false);
  useEffect(() => {
    useEditor.getState().init(project);
    // Zoom inicial que encaje la hoja en la pantalla
    const canvas = document.querySelector<HTMLElement>("[data-testid=editor-canvas]");
    const w = canvas?.clientWidth ?? window.innerWidth - 700;
    const { width } = pageSize(project.document.settings.orientation);
    useEditor.getState().setZoom(Math.min(1.25, Math.max(0.5, (w - 100) / (width * PX_PER_MM))));
  }, [project]);
  useAutosave();
  useShortcuts();
  const openExport = useCallback(async () => {
    await saveNow();
    setExportOpen(true);
  }, []);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background" data-testid="editor">
      {/* La barra superior flota sobre el lienzo, que se desplaza por debajo; los paneles laterales empiezan bajo ella. */}
      <TopBar onExport={openExport} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 bg-card pt-14">
          <LeftPanel />
        </div>
        <main className="flex min-w-0 flex-1 flex-col">
          {ready ? (
            <>
              <EditorCanvas />
              <PageStrip />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center pt-14 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" /> Abriendo examen…
            </div>
          )}
        </main>
        {ready && (
          <div className="flex min-h-0 bg-card pt-14">
            <PropertiesPanel />
          </div>
        )}
      </div>
      <ExportPdfDialog key={exportOpen ? "open" : "closed"} open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}

export { saveNow };
