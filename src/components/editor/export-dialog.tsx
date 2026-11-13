"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Eye, FileDown, Loader2, TriangleAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/store/editor-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { domIssue, reviewDocument, sortIssues, type ReviewIssue } from "@/lib/document/review";
import { totalPoints } from "@/lib/document/geometry";
import { findClippedElements, findMissingImageElements, measureContentHeightMm } from "./dom-utils";
import { cn } from "@/lib/utils";

/** Descarga el PDF generado por el servidor (Chromium) con el nombre elegido. */
export async function downloadPdf(projectId: string, fileName: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/pdf?filename=${encodeURIComponent(fileName)}`);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* sin JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Revisión del examen: comprobaciones del documento + medidas del renderizado real del editor. */
function useReview(open: boolean): ReviewIssue[] {
  const doc = useEditor((s) => s.doc);
  const base = useMemo(() => reviewDocument(doc), [doc]);
  const [dom, setDom] = useState<ReviewIssue[]>([]);
  useEffect(() => {
    if (!open) return;
    // Se mide tras pintar, cuando el lienzo ya refleja el documento actual.
    const t = setTimeout(() => {
      const found = [
        ...findClippedElements().map((id) => domIssue(doc, "clipped", id)),
        ...findMissingImageElements().map((id) => domIssue(doc, "missingImage", id)),
      ].filter(Boolean) as ReviewIssue[];
      setDom(found);
    }, 120);
    return () => clearTimeout(t);
  }, [doc, open]);
  return useMemo(() => sortIssues([...base, ...dom]), [base, dom]);
}

function IssueRow({ issue, onGo }: { issue: ReviewIssue; onGo: (i: ReviewIssue) => void }) {
  const st = useEditor.getState();
  const fix = (() => {
    switch (issue.kind) {
      case "outsidePage":
      case "outsideMargins":
        return { label: "Colocar dentro", run: () => st.fitInsideMargins(issue.elementId!) };
      case "clipped":
        return {
          label: "Agrandar la caja",
          run: () => {
            const h = measureContentHeightMm(issue.elementId!);
            if (h) st.updateElement(issue.elementId!, { h });
          },
        };
      case "totalMismatch":
        return { label: "Usar la suma", run: () => st.updateMeta({ totalScore: totalPoints(st.doc) }) };
      case "emptyPage":
        return { label: "Eliminar hoja", run: () => st.deletePage(st.doc.pages[issue.pageIndex!].id) };
      default:
        return null;
    }
  })();
  const error = issue.severity === "error";
  return (
    <li className={cn("flex items-start gap-2 rounded-md border p-2.5 text-sm", error ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50")} data-testid="review-issue" data-kind={issue.kind}>
      {error ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />}
      <span className="min-w-0 flex-1 leading-snug">{issue.message}</span>
      <span className="flex shrink-0 gap-1">
        {fix && (
          <Button size="sm" variant="outline" className="h-7 bg-card px-2" onClick={fix.run}>
            <Wand2 /> {fix.label}
          </Button>
        )}
        {(issue.elementId || issue.pageIndex !== undefined) && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onGo(issue)}>
            Ver
          </Button>
        )}
      </span>
    </li>
  );
}

export function ExportPdfDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const name = useEditor((s) => s.name);
  const projectId = useEditor((s) => s.projectId);
  const doc = useEditor((s) => s.doc);
  const [fileName, setFileName] = useState(name);
  const [busy, setBusy] = useState(false);
  const issues = useReview(open);
  const errors = issues.filter((i) => i.severity === "error").length;

  const goTo = (issue: ReviewIssue) => {
    const st = useEditor.getState();
    onOpenChange(false);
    if (issue.elementId) {
      st.select([issue.elementId]);
      st.reveal([issue.elementId]);
    } else if (issue.pageIndex !== undefined) {
      const id = st.doc.pages[issue.pageIndex].id;
      st.setActivePage(id);
      window.dispatchEvent(new CustomEvent("comicexam:scroll-to-page", { detail: id }));
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      await downloadPdf(projectId, fileName.trim() || name);
      toast.success("PDF generado", { description: "Revisa la carpeta de descargas." });
      onOpenChange(false);
    } catch (err) {
      toast.error("No se ha podido generar el PDF", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Exportar PDF</DialogTitle>
          <DialogDescription>
            A4 {doc.settings.orientation === "portrait" ? "vertical" : "horizontal"} · {doc.pages.length} hoja{doc.pages.length > 1 ? "s" : ""} · imágenes a resolución original.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pdf-name">Nombre del archivo</Label>
          <div className="flex items-center gap-2">
            <Input id="pdf-name" value={fileName} onChange={(e) => setFileName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} data-testid="pdf-filename" />
            <span className="text-sm text-muted-foreground">.pdf</span>
          </div>
        </div>

        <section className="space-y-2" data-testid="export-review">
          <h3 className="text-sm font-semibold">Revisión antes de imprimir</h3>
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">
              <CircleCheck className="size-4" /> Todo listo: nada se sale de la hoja, no hay textos cortados y la puntuación cuadra.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {errors > 0
                  ? `${errors} problema${errors > 1 ? "s" : ""} hará${errors > 1 ? "n" : ""} que falte contenido en el papel.`
                  : "No falta contenido, pero conviene revisar estos avisos."}
              </p>
              <ul className="thin-scroll max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {issues.map((i) => (
                  <IssueRow key={i.key} issue={i} onGo={goTo} />
                ))}
              </ul>
            </>
          )}
        </section>

        <DialogFooter>
          <Button variant="outline" asChild>
            <Link href={`/editor/${projectId}/vista-previa`}>
              <Eye /> Vista previa
            </Link>
          </Button>
          <Button onClick={run} disabled={busy} variant={errors > 0 ? "outline" : "default"} data-testid="download-pdf">
            {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
            {busy ? "Generando…" : errors > 0 ? "Descargar igualmente" : "Descargar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
