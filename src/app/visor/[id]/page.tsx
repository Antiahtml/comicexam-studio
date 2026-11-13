import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { LogoMark } from "@/components/layout/logo";
import { ComicViewer } from "@/components/comics/comic-viewer";

export const dynamic = "force-dynamic";

export default async function VisorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }> }) {
  const { id } = await params;
  const { p } = await searchParams;
  const comic = await prisma.comic.findUnique({ where: { id }, select: { id: true, title: true, pageCount: true, status: true } });
  if (!comic || comic.status !== "ready") notFound();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Link href="/biblioteca" className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" /> Biblioteca
        </Link>
        <LogoMark className="size-6" />
        <h1 className="truncate text-sm font-semibold">{comic.title}</h1>
        <span className="text-xs text-muted-foreground">{comic.pageCount} páginas</span>
      </header>
      <div className="min-h-0 flex-1">
        <ComicViewer comicId={comic.id} mode="library" initialPage={p ? Math.max(0, Number(p) - 1) : 0} />
      </div>
    </div>
  );
}
