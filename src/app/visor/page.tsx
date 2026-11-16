"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { ComicViewer } from "@/components/comics/comic-viewer";
import { NotFoundView } from "@/components/layout/not-found-view";
import { useQueryId } from "@/components/layout/use-query-id";
import { getComic } from "@/lib/local/repo";
import { useSearchParams } from "next/navigation";

function Visor() {
  const id = useQueryId();
  const p = Number(useSearchParams().get("p") || 1);
  const [comic, setComic] = useState<{ id: string; title: string; pageCount: number } | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void getComic(id).then((c) => alive && setComic(c && c.status === "ready" ? { id: c.id, title: c.title, pageCount: c.pageCount } : null));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!id || comic === null) return <NotFoundView what="El còmic" />;
  if (!comic)
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Carregant el còmic…
      </div>
    );
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Link href="/biblioteca" className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" /> Biblioteca
        </Link>
        <LogoMark className="size-6" />
        <h1 className="truncate text-sm font-semibold">{comic.title}</h1>
        <span className="text-xs text-muted-foreground">{comic.pageCount} pàgines</span>
      </header>
      <div className="min-h-0 flex-1">
        <ComicViewer comicId={comic.id} mode="library" initialPage={Number.isFinite(p) ? Math.max(0, p - 1) : 0} />
      </div>
    </div>
  );
}

export default function VisorPage() {
  return (
    <Suspense>
      <Visor />
    </Suspense>
  );
}
