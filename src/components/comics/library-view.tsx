"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookImage, Images, Loader2, MoreVertical, Pencil, Scissors, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Progress } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { ImportDropzone, ImportTasks } from "./import-dropzone";
import { useComicImport } from "@/hooks/use-comic-import";
import { formatBytes, relativeTime } from "@/lib/utils";
import { deleteComic, listComics, onDataChange, projectsUsingComic, renameComic, storageEstimate } from "@/lib/local/repo";
import { recoverStaleImports } from "@/lib/local/import-service";
import { pageImageUrl } from "@/lib/images/urls";
import type { ComicSummary } from "@/lib/client-types";

const FORMAT_LABEL: Record<ComicSummary["format"], string> = { rar: "CBR", zip: "CBZ", images: "Imágenes", bundle: "Proyecto" };

export function useComics() {
  const [comics, setComics] = useState<ComicSummary[] | null>(null);
  const reload = useCallback(async () => {
    try {
      setComics(await listComics());
    } catch (err) {
      toast.error("No se ha podido cargar la biblioteca", { description: (err as Error).message });
      setComics((c) => c ?? []);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    void recoverStaleImports()
      .then(() => listComics())
      .then((c) => alive && setComics(c))
      .catch(() => alive && setComics((c) => c ?? []));
    const off = onDataChange("comics", () => void listComics().then((c) => alive && setComics(c)));
    return () => {
      alive = false;
      off();
    };
  }, []);
  // Mientras haya importaciones en curso, se refresca el progreso.
  const processing = comics?.some((c) => c.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(reload, 1000);
    return () => clearInterval(t);
  }, [processing, reload]);
  return { comics, reload, setComics };
}

/** Espacio que ocupan los datos de la aplicación en este navegador. */
function StorageInfo({ refreshKey }: { refreshKey: number }) {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void storageEstimate().then((e) => alive && setEst(e));
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  if (!est) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Espacio usado en este navegador: <strong>{formatBytes(est.usage)}</strong>
      {est.quota > 0 && <> de {formatBytes(est.quota)} disponibles</>}
    </p>
  );
}

export function LibraryView() {
  /** Menú de acciones abierto (también con clic derecho sobre la tarjeta). */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { comics, reload } = useComics();
  const { tasks, importFiles, dismiss } = useComicImport(() => void reload());
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<ComicSummary | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const remove = async (c: ComicSummary) => {
    const usedBy = await projectsUsingComic(c.id).catch(() => [] as { id: string; name: string }[]);
    const ok = await confirm({
      title: `¿Eliminar «${c.title}»?`,
      description:
        usedBy.length > 0 ? (
          <div className="space-y-2" data-testid="comic-usage-warning">
            <p className="font-medium text-destructive">
              {usedBy.length === 1 ? "Lo usa 1 examen" : `Lo usan ${usedBy.length} exámenes`}: sus imágenes dejarán de verse en el papel.
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-foreground">
              {usedBy.slice(0, 6).map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
              {usedBy.length > 6 && <li>y {usedBy.length - 6} más…</li>}
            </ul>
            <p>También se borrarán sus páginas y viñetas guardadas. No se puede deshacer.</p>
          </div>
        ) : (
          "Se borrarán sus páginas y viñetas guardadas. Ningún examen lo usa. No se puede deshacer."
        ),
      confirmLabel: usedBy.length > 0 ? "Eliminar igualmente" : "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteComic(c.id, { force: usedBy.length > 0 });
      toast.success("Cómic eliminado");
      void reload();
    } catch (err) {
      toast.error((err as Error).message);
      void reload();
    }
  };

  const rename = async () => {
    if (!renaming || !newTitle.trim()) return;
    try {
      await renameComic(renaming.id, newTitle.trim());
      setRenaming(null);
      void reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display mb-2 text-4xl sm:text-5xl">Biblioteca de cómics</h1>
          <p className="text-sm text-muted-foreground">Importa tus cómics, ábrelos en el visor y selecciona las viñetas para tus exámenes.</p>
          <StorageInfo refreshKey={comics?.length ?? 0} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <ImportDropzone onFiles={importFiles} />
        <div className="space-y-3">
          <ImportTasks tasks={tasks} onDismiss={dismiss} />
          {tasks.length === 0 && (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Consejos</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Los archivos se procesan en tu navegador: nunca se suben a Internet.</li>
                <li>Se guardan solo en este navegador. Para llevarte un examen a otro equipo, expórtalo (.comicexam).</li>
                <li>Se admiten CBR (RAR 4 y RAR 5) y CBZ (ZIP).</li>
                <li>Las páginas se ordenan por nombre de forma natural (2 antes que 10).</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {comics === null ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando biblioteca…
        </div>
      ) : comics.length === 0 ? (
        <EmptyState
          icon={<BookImage />}
          title="Tu biblioteca está vacía"
          description="Importa tu primer cómic en formato CBR o CBZ para empezar a seleccionar viñetas."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {comics.map((c) => (
            <li
              key={c.id}
              className="group relative"
              data-testid="comic-card"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(c.id);
              }}
            >
              <Link
                href={c.status === "ready" ? `/visor?id=${c.id}` : "#"}
                aria-disabled={c.status !== "ready"}
                className="block overflow-hidden rounded-xl bg-card shadow-sm transition-[translate,scale,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lg active:duration-100 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] active:shadow-sm"
              >
                <div className="relative aspect-[2/3] bg-muted">
                  {c.coverPageId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pageImageUrl(c.coverPageId, "thumb")} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      {c.status === "error" ? <TriangleAlert className="size-8 text-destructive" /> : <Images className="size-8" />}
                    </div>
                  )}
                  {c.status === "processing" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/85 p-4 text-center">
                      <Loader2 className="size-6 animate-spin text-primary" />
                      <Progress value={c.progress} />
                      <p className="text-xs text-muted-foreground">{c.stage}</p>
                    </div>
                  )}
                  <Badge variant="muted" className="absolute top-2 left-2 bg-card/90 shadow-xs">
                    {FORMAT_LABEL[c.format]}
                  </Badge>
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug" title={c.title}>
                    {c.title}
                  </p>
                  {c.status === "error" ? (
                    <p className="line-clamp-3 text-xs text-destructive">{c.error}</p>
                  ) : (
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{c.pageCount} págs.</span>
                      {c.selectionCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Scissors className="size-3" /> {c.selectionCount}
                        </span>
                      )}
                      <span>{formatBytes(c.sizeBytes)}</span>
                    </p>
                  )}
                  <p className="text-2xs text-muted-foreground/80">{relativeTime(c.createdAt)}</p>
                </div>
              </Link>
              <DropdownMenu open={menuFor === c.id} onOpenChange={(o) => setMenuFor(o ? c.id : null)}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="iconSm" className="hover-reveal absolute top-2 right-2 shadow-sm" aria-label="Acciones">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {c.status === "ready" && (
                    <DropdownMenuItem asChild>
                      <Link href={`/visor?id=${c.id}`}>
                        <BookImage /> Abrir en el visor
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      setRenaming(c);
                      setNewTitle(c.title);
                    }}
                  >
                    <Pencil /> Cambiar nombre
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => remove(c)} disabled={c.status === "processing"}>
                    <Trash2 /> Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar nombre del cómic</DialogTitle>
          </DialogHeader>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} autoFocus />
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
