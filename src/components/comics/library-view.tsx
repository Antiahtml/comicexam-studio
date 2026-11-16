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

const FORMAT_LABEL: Record<ComicSummary["format"], string> = { rar: "CBR", zip: "CBZ", images: "Imatges", bundle: "Projecte" };

export function useComics() {
  const [comics, setComics] = useState<ComicSummary[] | null>(null);
  const reload = useCallback(async () => {
    try {
      setComics(await listComics());
    } catch (err) {
      toast.error("No s'ha pogut carregar la biblioteca", { description: (err as Error).message });
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
      Espai utilitzat en aquest navegador: <strong>{formatBytes(est.usage)}</strong>
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
      title: `Vols eliminar «${c.title}»?`,
      description:
        usedBy.length > 0 ? (
          <div className="space-y-2" data-testid="comic-usage-warning">
            <p className="font-medium text-destructive">
              {usedBy.length === 1 ? "L'usa 1 examen" : `L'usen ${usedBy.length} exàmens`}: les seves imatges deixaran de veure’s al paper.
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-foreground">
              {usedBy.slice(0, 6).map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
              {usedBy.length > 6 && <li>i {usedBy.length - 6} més…</li>}
            </ul>
            <p>També s’esborraran les seves pàgines i vinyetes desades. No es pot desfer.</p>
          </div>
        ) : (
          "S'esborraran les seves pàgines i vinyetes desades. Cap examen l'utilitza. No es pot desfer."
        ),
      confirmLabel: usedBy.length > 0 ? "Elimina igualment" : "Elimina",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteComic(c.id, { force: usedBy.length > 0 });
      toast.success("Còmic eliminat");
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
          <h1 className="text-display mb-2 text-4xl sm:text-5xl">Biblioteca de còmics</h1>
          <p className="text-sm text-muted-foreground">Importa els teus còmics, obre’ls al visor i selecciona les vinyetes per als teus exàmens.</p>
          <StorageInfo refreshKey={comics?.length ?? 0} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <ImportDropzone onFiles={importFiles} />
        <div className="space-y-3">
          <ImportTasks tasks={tasks} onDismiss={dismiss} />
          {tasks.length === 0 && (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Consells</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Els fitxers es processen al teu navegador: mai es pugen a Internet.</li>
                <li>Es desen només en aquest navegador. Per endur-te un examen a un altre equip, exporta’l (.comicexam).</li>
                <li>S’admeten CBR (RAR 4 i RAR 5) i CBZ (ZIP).</li>
                <li>Les pàgines s’ordenen pel nom de forma natural (2 abans que 10).</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {comics === null ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregant la biblioteca…
        </div>
      ) : comics.length === 0 ? (
        <EmptyState
          icon={<BookImage />}
          title="La teva biblioteca és buida"
          description="Importa el teu primer còmic en format CBR o CBZ per començar a seleccionar vinyetes."
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
                      <span>{c.pageCount} pàg.</span>
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
                  <Button variant="outline" size="iconSm" className="hover-reveal absolute top-2 right-2 shadow-sm" aria-label="Accions">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {c.status === "ready" && (
                    <DropdownMenuItem asChild>
                      <Link href={`/visor?id=${c.id}`}>
                        <BookImage /> Obre al visor
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      setRenaming(c);
                      setNewTitle(c.title);
                    }}
                  >
                    <Pencil /> Canvia el nom
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => remove(c)} disabled={c.status === "processing"}>
                    <Trash2 /> Elimina
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
            <DialogTitle>Canvia el nom del còmic</DialogTitle>
          </DialogHeader>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel·la
            </Button>
            <Button onClick={rename}>Desa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
