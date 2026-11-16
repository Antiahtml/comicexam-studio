"use client";

import { Suspense, useEffect, useState } from "react";
import { PrintPreview } from "@/components/editor/print-preview";
import { NotFoundView } from "@/components/layout/not-found-view";
import { useQueryId } from "@/components/layout/use-query-id";
import { getProject } from "@/lib/local/repo";

function Preview() {
  const id = useQueryId();
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    getProject(id)
      .then((p) => alive && setName(p?.name ?? null))
      .catch(() => alive && setName(null));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!id || name === null) return <NotFoundView what="L'examen" />;
  if (name === undefined) return null;
  return <PrintPreview projectId={id} name={name} />;
}

export default function VistaPreviaPage() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
