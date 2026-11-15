"use client";

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EditorShell } from "@/components/editor/editor-shell";
import { NotFoundView } from "@/components/layout/not-found-view";
import { useQueryId } from "@/components/layout/use-query-id";
import { getProject } from "@/lib/local/repo";
import type { ExamDocument } from "@/lib/document/types";

function Editor() {
  const id = useQueryId();
  const [project, setProject] = useState<{ id: string; name: string; document: ExamDocument } | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    getProject(id)
      .then((p) => {
        if (!alive) return;
        setProject(p ? { id: p.id, name: p.name, document: p.document } : null);
        if (p) document.title = `${p.name} · ComicExam Studio`;
      })
      .catch(() => alive && setProject(null));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!id || project === null) return <NotFoundView what="El examen" />;
  if (!project)
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Abriendo examen…
      </div>
    );
  return <EditorShell project={project} />;
}

export default function EditorPage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
