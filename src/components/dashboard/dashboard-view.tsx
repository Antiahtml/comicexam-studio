"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookImage,
  Copy,
  Download,
  FileStack,
  FileUp,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Scissors,
  Sparkles,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm";
import { useComics } from "@/components/comics/library-view";
import { downloadBlob, relativeTime, safeFileName } from "@/lib/utils";
import { createProject, deleteProject, duplicateProject, listProjects, onDataChange, renameProject } from "@/lib/local/repo";
import { exportProjectBundle, importProjectBundle } from "@/lib/local/bundle";
import { importOrderedImages } from "@/lib/local/import-service";
import { withBase } from "@/lib/env";
import { pageImageUrl, sourceUrl } from "@/lib/images/urls";
import type { ProjectSummaryDTO } from "@/lib/client-types";

export function DashboardView() {
  const router = useRouter();
  const confirm = useConfirm();
  const [projects, setProjects] = useState<ProjectSummaryDTO[] | null>(null);
  const { comics } = useComics();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<ProjectSummaryDTO | null>(null);
  const [busy, setBusy] = useState(false);
  /** Menú de acciones abierto (también con clic derecho sobre la tarjeta). */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      toast.error("No se han podido cargar los exámenes", { description: (err as Error).message });
      setProjects([]);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    listProjects()
      .then((p) => alive && setProjects(p))
      .catch(() => alive && setProjects([]));
    const off = onDataChange("projects", () => void listProjects().then((p) => alive && setProjects(p)));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const p = await createProject(newName.trim() || "Examen sin título");
      router.push(`/editor?id=${p.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  const duplicate = async (p: ProjectSummaryDTO) => {
    try {
      await duplicateProject(p.id);
      toast.success("Examen duplicado");
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async (p: ProjectSummaryDTO) => {
    const ok = await confirm({ title: `¿Eliminar «${p.name}»?`, description: "Esta acción no se puede deshacer. Los cómics de la biblioteca no se borran.", confirmLabel: "Eliminar", destructive: true });
    if (!ok) return;
    try {
      await deleteProject(p.id);
      toast.success("Examen eliminado");
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const rename = async () => {
    if (!renaming || !newName.trim()) return;
    try {
      await renameProject(renaming.id, newName.trim());
      setRenaming(null);
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const importProject = async (data: Blob, what = "Proyecto importado") => {
    const t = toast.loading("Importando examen…", { description: "Se procesan sus imágenes en tu navegador." });
    try {
      const id = await importProjectBundle(new Uint8Array(await data.arrayBuffer()), importOrderedImages);
      toast.success(what, { id: t, description: undefined });
      router.push(`/editor?id=${id}`);
    } catch (err) {
      toast.error("No se ha podido importar", { id: t, description: (err as Error).message });
    }
  };

  /** Examen de ejemplo incluido en la web (con un cómic de prueba creado desde cero). */
  const loadExample = async () => {
    setBusy(true);
    try {
      const res = await fetch(withBase("/ejemplo.comicexam"));
      if (!res.ok) throw new Error("No se ha podido descargar el ejemplo.");
      await importProject(await res.blob(), "Examen de ejemplo cargado");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportProject = async (p: ProjectSummaryDTO) => {
    try {
      const bundle = await exportProjectBundle(p.id);
      downloadBlob(bundle.data, `${safeFileName(bundle.name, "examen")}.comicexam`, "application/zip");
    } catch (err) {
      toast.error("No se ha podido exportar", { description: (err as Error).message });
    }
  };

  const readyComics = (comics ?? []).filter((c) => c.status === "ready" && c.format !== "images");

  return (
    <div className="space-y-14">
      {/* Cabecera */}
      <section className="relative px-2 py-8 sm:px-6 sm:py-14">
        <div className="relative z-10 max-w-2xl space-y-5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Scissors className="size-3.5" /> Exámenes a partir de cómics
          </p>
          <h1 className="text-display text-[2.6rem] sm:text-6xl">
            Crea exámenes visuales con <span className="font-comic text-[1.1em] font-normal tracking-wide text-[#b45309] dark:text-comic">viñetas</span> de tus cómics
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">Importa un CBR o CBZ, recorta las viñetas que necesites, colócalas en hojas A4 junto a tus preguntas y exporta un PDF listo para imprimir.</p>
          {/* Una sola acción principal; el resto, en un segundo plano visual. */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => {
                setNewName("");
                setCreating(true);
              }}
              data-testid="new-exam"
            >
              <Plus /> Nuevo examen
            </Button>
            <Button size="lg" variant="glass" asChild>
              <Link href="/biblioteca">
                <BookImage /> Biblioteca de cómics
              </Link>
            </Button>
            <button
              type="button"
              onClick={() => importInput.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <FileUp className="size-4" /> o importa un examen (.comicexam)
            </button>
            <input
              ref={importInput}
              type="file"
              accept=".comicexam,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importProject(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="pointer-events-none absolute right-4 bottom-2 hidden rotate-6 xl:block" aria-hidden>
          <div className="grid w-72 grid-cols-2 gap-2 rounded-xl border-4 border-slate-900 bg-card p-2 shadow-xl">
            <div className="col-span-2 h-20 rounded border-2 border-slate-900 bg-amber-200" />
            <div className="h-24 rounded border-2 border-slate-900 bg-sky-200" />
            <div className="h-24 rounded border-2 border-slate-900 bg-rose-200" />
          </div>
        </div>
      </section>

      {/* Exámenes recientes */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-headline text-3xl">Exámenes recientes</h2>
            <p className="text-sm text-muted-foreground">Se guardan automáticamente mientras trabajas.</p>
          </div>
        </div>
        {projects === null ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FileStack />}
            title="Aún no has creado ningún examen"
            description="Empieza con un examen en blanco: incluye una cabecera con título, nombre del alumno y nota."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Crear mi primer examen
                </Button>
                <Button variant="outline" onClick={loadExample} disabled={busy} data-testid="load-example">
                  {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Ver un examen de ejemplo
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <li>
              <button
                onClick={() => {
                  setNewName("");
                  setCreating(true);
                }}
                className="flex aspect-[210/297] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-card/50 text-muted-foreground transition-[color,border-color,translate,scale] hover:border-primary hover:text-primary motion-safe:active:scale-[0.98]"
              >
                <Plus className="size-8" />
                <span className="text-sm font-medium">Nuevo examen</span>
              </button>
            </li>
            {projects.map((p) => (
              <li
                key={p.id}
                className="group relative"
                data-testid="project-card"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuFor(p.id);
                }}
              >
                <Link href={`/editor?id=${p.id}`} className="block overflow-hidden rounded-xl bg-card shadow-sm transition-[translate,scale,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lg active:duration-100 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] active:shadow-sm">
                  <div className="relative flex aspect-[210/240] items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 p-4">
                    {p.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sourceUrl(p.cover, "thumb")} alt="" className="max-h-full max-w-full rounded-sm bg-white object-contain shadow-md" loading="lazy" />
                    ) : (
                      <SquarePen className="size-10 text-slate-300" />
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="truncate font-semibold" title={p.name}>
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.pageCount} hoja{p.pageCount === 1 ? "" : "s"} · {p.elementCount} elementos · {relativeTime(p.updatedAt)}
                    </p>
                  </div>
                </Link>
                <DropdownMenu open={menuFor === p.id} onOpenChange={(o) => setMenuFor(o ? p.id : null)}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="iconSm" className="hover-reveal absolute top-2 right-2 shadow-sm" aria-label="Acciones">
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/editor?id=${p.id}`}>
                        <SquarePen /> Abrir
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenaming(p);
                        setNewName(p.name);
                      }}
                    >
                      <Pencil /> Cambiar nombre
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => duplicate(p)}>
                      <Copy /> Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => exportProject(p)}>
                      <Download /> Exportar (.comicexam)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(p)}>
                      <Trash2 /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Biblioteca */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-headline text-3xl">Biblioteca de cómics</h2>
            <p className="text-sm text-muted-foreground">{readyComics.length} cómic{readyComics.length === 1 ? "" : "s"} disponibles.</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/biblioteca">
              <Upload /> Importar y gestionar
            </Link>
          </Button>
        </div>
        {readyComics.length === 0 ? (
          <EmptyState icon={<BookImage />} title="Biblioteca vacía" description="Importa tu primer cómic (.cbr o .cbz) para empezar a seleccionar viñetas." action={<Button asChild><Link href="/biblioteca">Ir a la biblioteca</Link></Button>} />
        ) : (
          <ul className="flex gap-4 overflow-x-auto pb-2 thin-scroll">
            {readyComics.slice(0, 12).map((c) => (
              <li key={c.id} className="w-32 shrink-0">
                <Link href={`/visor?id=${c.id}`} className="block space-y-1.5">
                  <div className="aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-black/5 transition-[translate,scale,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md active:duration-100 motion-safe:active:scale-[0.97]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.coverPageId && <img src={pageImageUrl(c.coverPageId, "thumb")} alt="" className="size-full object-cover" loading="lazy" />}
                  </div>
                  <p className="line-clamp-2 text-xs font-medium">{c.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo examen</DialogTitle>
            <DialogDescription>Ponle un nombre. Podrás cambiarlo en cualquier momento.</DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Comprensión lectora — Cómic"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && create()}
            data-testid="new-exam-name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={create} disabled={busy} data-testid="create-exam">
              {busy && <Loader2 className="animate-spin" />} Crear examen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar nombre</DialogTitle>
          </DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button onClick={rename}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
