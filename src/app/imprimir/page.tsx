"use client";

import { Suspense, useEffect, useState } from "react";
import { PrintDocument } from "@/components/document/print-document";
import { useQueryId } from "@/components/layout/use-query-id";
import { getProject } from "@/lib/local/repo";
import type { ExamDocument } from "@/lib/document/types";

/** Vista de impresión: SOLO el documento, sin controles. Es lo que se imprime o guarda como PDF. */
function Imprimir() {
  const id = useQueryId();
  const [doc, setDoc] = useState<ExamDocument | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    getProject(id)
      .then((p) => {
        if (!alive) return;
        setDoc(p?.document ?? null);
        if (p) document.title = p.name;
      })
      .catch(() => alive && setDoc(null));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!id || doc === null) return <p style={{ padding: 24, fontFamily: "system-ui" }}>Examen no trobat en aquest navegador.</p>;
  if (!doc) return null;
  return <PrintDocument doc={doc} />;
}

export default function ImprimirPage() {
  return (
    <Suspense>
      <Imprimir />
    </Suspense>
  );
}
