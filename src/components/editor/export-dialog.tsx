"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Eye, Loader2, Printer, TriangleAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/store/editor-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { domIssue, reviewDocument, sortIssues, type ReviewIssue } from "@/lib/document/review";
import { totalPoints } from "@/lib/document/geometry";
import { findClippedElements, findMissingImageElements, measureContentHeightMm } from "./dom-utils";
import { cn } from "@/lib/utils";
import { printProject } from "@/lib/print";

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
        return { label: "Col·loca a dins", run: () => st.fitInsideMargins(issue.elementId!) };
      case "clipped":
        return {
          label: "Amplia la caixa",
          run: () => {
            const h = measureContentHeightMm(issue.elementId!);
            if (h) st.updateElement(issue.elementId!, { h });
          },
        };
      case "totalMismatch":
        return { label: "Utilitza la suma", run: () => st.updateMeta({ totalScore: totalPoints(st.doc) }) };
      case "emptyPage":
        return { label: "Elimina el full", run: () => st.deletePage(st.doc.pages[issue.pageIndex!].id) };
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
            Veure
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
      const { errors: missing } = await printProject(projectId, fileName.trim() || name);
      if (missing > 0) toast.warning(`${missing} imatge(s) no estan disponibles i sortiran com a avís.`);
      onOpenChange(false);
    } catch (err) {
      toast.error("No s'ha pogut preparar la impressió", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Exporta en PDF</DialogTitle>
          <DialogDescription>
            A4 {doc.settings.orientation === "portrait" ? "vertical" : "horitzontal"} · {doc.pages.length} full{doc.pages.length > 1 ? "s" : ""} · imatges a resolució
            original. S’obrirà la finestra d’impressió: tria <strong>«Desa com a PDF»</strong> com a destinació (o la teva impressora).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pdf-name">Nom del fitxer</Label>
          <div className="flex items-center gap-2">
            <Input id="pdf-name" value={fileName} onChange={(e) => setFileName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} data-testid="pdf-filename" />
            <span className="text-sm text-muted-foreground">.pdf</span>
          </div>
        </div>

        <section className="space-y-2" data-testid="export-review">
          <h3 className="text-sm font-semibold">Revisió abans d’imprimir</h3>
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">
              <CircleCheck className="size-4" /> Tot a punt: res no surt del full, no hi ha textos tallats i la puntuació quadra.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {errors > 0
                  ? `${errors} problema${errors > 1 ? "es" : ""} farà${errors > 1 ? "n" : ""} que falti contingut al paper.`
                  : "No falta contingut, però convé revisar aquests avisos."}
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
            <Link href={`/vista-previa?id=${projectId}`}>
              <Eye /> Vista prèvia
            </Link>
          </Button>
          <Button onClick={run} disabled={busy} variant={errors > 0 ? "outline" : "default"} data-testid="print-pdf">
            {busy ? <Loader2 className="animate-spin" /> : <Printer />}
            {busy ? "Preparant…" : errors > 0 ? "Imprimeix igualment" : "Imprimeix / Desa en PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
