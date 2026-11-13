"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, FileDown, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/store/editor-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { pageWarnings } from "@/lib/document/geometry";

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

export function ExportPdfDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const name = useEditor((s) => s.name);
  const projectId = useEditor((s) => s.projectId);
  const doc = useEditor((s) => s.doc);
  const [fileName, setFileName] = useState(name);
  const [busy, setBusy] = useState(false);

  const problems = doc.pages.reduce((n, p) => n + pageWarnings(p, doc.settings).outside.size, 0);

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
      <DialogContent className="sm:max-w-md">
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
        {problems > 0 && (
          <div className="flex gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            <TriangleAlert className="size-4 shrink-0" />
            Hay {problems} elemento(s) fuera de la zona imprimible. Puede que no se impriman completos.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" asChild>
            <Link href={`/editor/${projectId}/vista-previa`}>
              <Eye /> Vista previa
            </Link>
          </Button>
          <Button onClick={run} disabled={busy} data-testid="download-pdf">
            {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
            {busy ? "Generando…" : "Descargar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
